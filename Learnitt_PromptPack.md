# Learnitt · Phase 3 Prompt Pack

**Pairs with:** `Learnitt_PRD.md` (keep it in the repo root, the agent reads it every phase)
**For:** Claude Code or Antigravity, one prompt at a time
**Shape:** 14 prompts (L0 to L13), mapped to PRD milestones M0 to M11

---

## How to use this pack

1. Paste the **Global context** block once at the start of every new agent session.
2. Run **one prompt at a time**. Each ends with a verification list. Do not move on until every item passes.
3. After each prompt: review the diff, run the full test suite, commit, then paste the **Carry forward** note at the start of the next prompt so the agent keeps context.
4. If the agent proposes something that conflicts with the PRD, tell it to stop and re-read the PRD section.
5. Work on a branch per prompt (`l3-goals-graph`). Merge only when verified.

### Defaults I assumed for the three open decisions in PRD section 16

Change these before L3 if you disagree.

| Decision | Default used in this pack |
|---|---|
| Study days | Monday to Friday, about 96 minutes a day at 8 hours a week |
| Verification for applied skills | A user-confirmed override counts as E2. Skills marked `artifact` need E3, which needs you to confirm the expected output |
| First real run | Data engineering is the live goal. The health analytics plan is a test fixture for the import path in L3 |

### gstack skills to use alongside (if you have gstack installed in Claude Code)

| When | Skill | Use |
|---|---|---|
| Before each prompt | `/office-hours` | Only if scope feels off. Already run once for this project |
| After each prompt | `/review` | Pre-merge review for bugs that pass CI but break in use |
| After L6, L7, L10, L13 | `/qa` | Real-browser click-through with fix and verify loop |
| End of each milestone | `/ship` | Run tests, review, push, open the PR |

gstack skill names can change between versions. If one is missing, run the same step by hand.

---

## Global context (paste once per session)

```
You are building Learnitt, a goal-agnostic learning companion. Mobile-first PWA with an
offline daily loop. The source of truth is Learnitt_PRD.md in the repo root. Read it fully
before starting any phase. If a prompt conflicts with the PRD, stop and ask me.

STACK (do not substitute without asking)
- Next.js App Router, TypeScript strict, Tailwind
- opendraft component library, installed as source through its shadcn registry. Before using
  it, read https://ui-system-virid.vercel.app/docs/introduction, /docs/theming and /docs/ai.
  Use the install command shown on each component's docs page. Never hand-copy component code.
  Never hard-code colours, shadows, easings or springs: tokens live in app/globals.css and
  motion lives in lib/motion.ts.
- Supabase: Postgres, Auth (Google, magic link, email OTP), Storage. RLS on every table.
- Dexie (IndexedDB) for the offline store and outbox.
- zod for every request and every AI response. Vitest for unit and integration, Playwright
  for end to end.
- Hosting: Vercel. Local: Supabase CLI.

REPO LAYOUT
- src/app: routes and route handlers under src/app/api/v1
- src/lib/ai: provider seam, tasks, prompts, cache, usage
- src/lib/planner: pure planning functions, no I/O
- src/lib/retrieval: chunking and search
- src/lib/sync: Dexie schema, outbox, sync loop
- src/lib/env.ts: zod-validated environment
- supabase/migrations: SQL migrations
- tests: unit, integration, e2e

INVARIANTS (never break these)
1. Every user-owned table has owner_id and RLS (owner_id = auth.uid()). A test proves user A
   cannot read or write user B's rows on every table.
2. Mock mode: every external dependency (AI, search, email, push) is an interface with a real
   and a mock implementation. The whole app runs and all tests pass with zero real keys.
3. No model names in business logic. Provider and model come from config. AI output is always
   validated against a zod schema. Invalid output is retried once, then fails visibly.
4. The AI never produces a URL the user sees. Resource URLs come only from the search
   provider, and must pass a liveness check.
5. The planner is a pure, deterministic function. Same inputs, same output.
6. Never silently remove or reorder a skill. Any scope change needs user confirmation and a
   goal_changes row.
7. Evidence rules from PRD section 6 are exact. A self-rated skill is never "verified".
8. Journal text never goes to the AI unless the user explicitly asks for a summary.
9. The server decides state and access. The client displays and queues.
10. No secrets in the client bundle. The build fails if a service key string appears in
    client output.

UX COPY RULES (apply to every string a user can see)
- No em dashes. Use commas or full stops.
- Voice: direct and explanatory, like Kuda, Moniepoint or Carbon. Say what happened and what
  to do next. No cleverness, no filler, no guilt.
- Examples of the right tone:
  "You missed 2 sessions this week. Pick how to catch up."
  "AI is paused until tomorrow. Your answer is saved and will be graded then."
  "No signal. 2 changes will sync when you are back online."
- Examples of the wrong tone: "Oops!", "You're falling behind!", "Let's get back on track".

WORKING RULES
- One phase at a time. Finish, run tests, commit, then stop for my review.
- Tests are part of the phase. A phase is not done until its tests exist and pass in CI.
- Atomic commits with clear messages.
- Additive migrations only after L1 ships. No renames, no drops without asking.
- If you are blocked, say what blocked you. Do not guess.

Confirm you understand, then wait for the phase prompt.
```

---

## L0 · Foundation

**Maps to:** M0 · **gstack:** `/review` after

**Prompt**

```
Phase L0: Foundation. Do not build features yet.

1. Create the Next.js app (App Router, TypeScript strict, Tailwind) with the repo layout in
   the global context. Add ESLint, Prettier, EditorConfig, and scripts: dev, build, lint,
   typecheck, test, test:e2e.
2. Install opendraft following /docs/introduction, /docs/theming and /docs/ai. Install only
   what we need for now: Button, Input, Field, Card, Dialog, Toast (sonner), Skeleton,
   Empty State, Theme Toggle, Page Header, Site Header, Alert, Switch, Tabs. Do not install
   heavy components (Rich Text Editor, Document Viewer, Time Series Chart, Gantt, Video
   Player, Map View, Voice Orb) yet.
3. Set up Supabase locally with the CLI. Add .env.example listing every variable, no values.
   Create src/lib/env.ts that validates all env vars with zod at boot and fails with a clear
   message. Include a MOCK_MODE flag that defaults to true in local and test.
4. Auth: Google, magic link, and email OTP using Supabase Auth. Build the sign-in screen
   (S01) using the opendraft Auth Screen and OTP Input. Add /auth/callback. On first sign-in
   a profiles row is created (database trigger). Sign-out works.
5. Protected layout: unauthenticated users are redirected to sign in. Add a placeholder
   Today route that shows the user's display name.
6. Define the provider interfaces only (no real calls yet): AIProvider, SearchProvider,
   EmailProvider, PushProvider, each with a mock implementation returning deterministic
   fixtures. A registry picks real or mock from env.
7. PWA shell: web manifest, icons placeholder, and a service worker that precaches the app
   shell only. No data caching yet.
8. CI (GitHub Actions): install, typecheck, lint, test, build. Block merge on failure.
9. Add a build-time check that fails if SUPABASE_SERVICE_ROLE_KEY or any provider key string
   appears in the client bundle.
10. README with run instructions for local mock mode.

Tests: env validation fails on a missing variable; mock providers resolve under test; sign-in
route redirects when unauthenticated; the client-bundle secret check catches a planted string.
```

**Verify**
- [ ] `pnpm dev` boots in mock mode with no keys
- [ ] Sign in with a magic link works locally, profiles row appears
- [ ] Unauthenticated visit to Today redirects to sign in
- [ ] CI is green, including the bundle secret check

**Carry forward:** "L0 done. Repo layout and provider interfaces exist. Auth works. Mock mode is the default. Only light opendraft components are installed."

---

## L1 · Schema and RLS

**Maps to:** M0 and M1 foundation · **gstack:** `/review`

**Prompt**

```
Phase L1: Database schema and RLS. Use PRD section 8 as the exact spec.

1. Write Supabase migrations for every table in PRD section 8: profiles, goals, skills,
   skill_prereqs, materials, material_chunks, skill_material_links, resources, plan_items,
   check_ins, quizzes, quiz_questions, attempts, grades, conversations, messages,
   journal_entries, skill_reviews, goal_changes, ai_jobs, ai_cache, usage_counters,
   reminder_settings, push_subscriptions, audit_events. Also add reminder_log
   (owner_id, kind, day, unique on all three) and saved_cards (owner_id, skill_id, question,
   answer, created_at) for the flashcard action in L8.
2. Enable RLS on every table. Policies: select, insert, update, delete where
   owner_id = auth.uid(). For ai_cache, ai_jobs and usage_counters: no direct client access.
   Only the service role (server worker) reads and writes them. Add a view or RPC for the
   client to read its own usage_counters row.
3. Storage: private bucket "materials". Policies let a user read and write only objects under
   their own owner_id prefix.
4. Add the partial unique index so only one goal per owner can be active.
5. Seed script (idempotent): two test users, and for user A a data engineering goal with a
   sample skill graph. Also include a second seeded goal from a non-technical domain (a
   language) so tests prove the schema is domain-agnostic.
6. Generate TypeScript types from the schema and commit them.
7. RLS test suite: for EVERY table, user A cannot select, insert, update or delete user B's
   rows, and anonymous access returns nothing. Include storage object access tests.

Do not write any feature code in this phase.
```

**Verify**
- [ ] `supabase db reset` applies all migrations and the seed cleanly
- [ ] RLS suite covers every table, both users, read and write, and passes
- [ ] A second active goal for the same user is rejected by the database
- [ ] Types are generated and typecheck passes

**Carry forward:** "L1 done. Full schema with RLS is in place. Seed has two users and two goals (data engineering, language). RLS suite is green. All later migrations must be additive."

---

## L2 · AI seam, jobs, cache and cost control

**Maps to:** M1 support · **gstack:** `/review`

**Prompt**

```
Phase L2: AI provider seam, job queue, cache and cost control. Use PRD section 7 and section 9
(job pattern).

1. Implement AIProvider.generateStructured exactly as in PRD 7.1. Build:
   - MockAIProvider returning deterministic fixtures per task
   - A real adapter for the free-tier provider configured in env (AI_PROVIDER, AI_MODEL,
     AI_API_KEY). The model name comes only from config. Do not hard-code any model name.
   - A fallback provider slot (AI_FALLBACK_PROVIDER, optional)
2. Define the AITask enum and a zod schema for each task output (PRD 7.2 to 7.4): skill_graph,
   link_materials, search_queries, classify_resource, make_quiz, grade_applied,
   answer_question, explain_level, weekly_summary. Store prompts in src/lib/ai/prompts with a
   PROMPT_VERSION per prompt. Every system prompt states: do not invent URLs, citations, or
   facts about the user.
3. Validation: every response is validated against its schema. On failure, retry once with the
   validation error appended. If it still fails, mark the job failed with a readable reason.
4. Cache: cache_key = hash(task, canonical input, provider id, prompt version). Check ai_cache
   before any call. Cache hits do not count toward usage.
5. Cost control: usage_counters per owner per day. A global DAILY_AI_CALL_CAP and a per-user
   sub-budget from env, both set conservatively (default 300 and 150). When a cap is hit,
   jobs move to status paused_cap and the route returns a clear message. Non-AI routes keep
   working.
6. Job queue on ai_jobs: enqueue helper, a worker route POST /api/v1/cron/worker protected by
   a CRON_SECRET header, lease via locked_until, at most 3 jobs per tick, exponential backoff
   on rate-limit errors (HTTP 429 or provider equivalent). GET /api/v1/jobs/:id returns
   status and result_ref for the owner only.
7. GET /api/v1/usage returns today's and this week's usage and remaining budget for the user.
8. A dev-only route or script that runs one tick of the worker locally.

Tests: schema validation rejects malformed output and succeeds on the retry path; cache hit
skips the provider; cap reached sets paused_cap and non-AI routes still return 200; worker
lease prevents double execution; rate-limit error triggers backoff and then fallback; swapping
provider by env changes no business code.
```

**Verify**
- [ ] With mock mode, enqueue a `skill_graph` job, run one worker tick, get a valid graph
- [ ] Forcing the cap to 0 pauses AI jobs and the app still works
- [ ] No model name string exists outside config and tests (grep check)
- [ ] Job status endpoint refuses another user's job

**Carry forward:** "L2 done. AI seam with mock and real adapters, schemas for all tasks, cache, caps, job queue and worker exist. Model names live only in config."

---

## L3 · Goals, skill graph and feasibility

**Maps to:** M1 · **gstack:** `/review`, then `/qa` on S02 and S03

**Prompt**

```
Phase L3: Goal setup, skill graph, feasibility. Epic A in the PRD. Screens S02 and S03.

1. Goal wizard (S02) using Stepper, Field, Date Picker, Slider, Alert. Fields: title, domain,
   starting level, target date (future only), weekly hours (1 to 20, default 8), study days
   (default Monday to Friday). Timezone comes from the profile. Saves a draft goal.
2. POST /goals/:id/skill-graph enqueues the skill_graph job. The UI shows progress while the
   job runs. On success, show the skill list.
3. Validate the graph per PRD 7.3: 12 to 20 skills, unique ids, prerequisites exist, no
   cycles, min estimate less than or equal to max. A cycle triggers one AI repair attempt,
   then a visible failure with a retry button.
4. Skill graph editor (S03) using Step Navigation and Repeater Field: rename, edit estimate,
   change priority, add, remove (confirmation required), reorder, edit prerequisites. Each
   edit is saved and written to goal_changes as graph_edit. Editing recomputes feasibility.
5. Feasibility (src/lib/planner/feasibility.ts, pure function): remaining minutes divided by
   capacity from today to target date. Bands: feasible under 85%, tight 85 to 100%, not
   feasible over 100%. Show with the Gauge. For tight or not feasible, show the three options
   from PRD A3 (extend date, add hours, reduce scope) and apply only on user confirmation.
   Reduce scope lists proposed skills lowest priority first and never removes without a tick.
6. Import (A4): paste or upload .md or .txt of an existing plan. A task converts phases and
   weeks into skills for review before saving. Store the original as a material of kind
   plan_import. Do not process other file types here.
7. Activate: POST /goals/:id/activate. If another goal is active, ask to archive it first.
8. Copy follows the UX copy rules. Example for a tight plan: "This is tight. You have 142
   hours of work and 128 hours available. Pick one option."

Tests: feasibility bands at 84, 85, 100 and 101 percent; cycle detection; graph validation
failures surface readable errors; one-active-goal rule; scope reduction never removes without
confirmation; import of the health analytics plan (fixture in tests/fixtures) produces a
reviewable graph; all of it runs in mock mode.
```

**Verify**
- [ ] Create the data engineering goal, generate a graph, edit it, see feasibility change
- [ ] Import the health analytics plan fixture and save it as a second (draft) goal
- [ ] Creating a second active goal prompts to archive the first
- [ ] Every edit has a goal_changes row

**Carry forward:** "L3 done. Goals, graph generation, graph editor, feasibility and import work. Skills and prerequisites are stored. Next: materials."

---

## L4 · Materials, extraction and retrieval

**Maps to:** M2 · **gstack:** `/review`

**Prompt**

```
Phase L4: Materials, extraction, retrieval, linking. Epic B1 and B2 in the PRD. Screens S04, S05.

1. Upload (Dropzone): PDF, .md, .txt, .docx and URLs. Max 20 MB per file, 200 MB per user.
   POST /materials returns a signed upload URL to the private bucket. Validate type by magic
   bytes on the server, sanitise the filename, store the content hash and skip exact duplicates.
2. POST /materials/:id/process enqueues extraction. Extract text from each type (a PDF parser
   and a DOCX parser, with timeouts). URLs: fetch the page and extract readable text, with a
   size limit and a block on private IP ranges (SSRF protection). Failures set
   status needs_attention with a readable reason. The file stays.
3. Chunk to about 800 tokens with 100 overlap and store in material_chunks with the tsvector
   column. Retrieval function: search chunks by full-text query scoped to the owner and
   optionally to a goal, ranked, top N, returned with material title and ordinal.
4. Linking: the link_materials task proposes skill to material links with confidence. Above 0.7
   they appear as suggested, below as weak. The user confirms or removes. Confirmed links are
   never overwritten by a later run.
5. Library screen (S04) with status badges and an Empty State. Material viewer (S05) using the
   Document Viewer for PDFs and plain rendering for text. Lazy-load the viewer.
6. Show which skills have no material yet.
7. Consent (I3): before the first AI call that uses materials, show what will be sent
   (material names and chunk counts) and ask once. Store the answer on the profile. The AI
   layer refuses material-based tasks if consent is off.
8. Signed URLs expire in 5 minutes. No public URLs anywhere.

Tests: magic-byte rejection of a renamed file; duplicate hash skipped; extraction failure path;
chunk sizes; retrieval returns the expected chunk for a known query; retrieval never returns
another user's chunk; SSRF block on a private IP URL; consent off blocks material-based AI
tasks; confirmed links survive a re-run.
```

**Verify**
- [ ] Upload a real PDF, see chunks, search returns the right passage
- [ ] A renamed .exe is rejected
- [ ] Skills without material are listed
- [ ] The consent prompt appears once and is respected

**Carry forward:** "L4 done. Materials are uploaded, extracted, chunked and searchable. Skill to material links exist. Consent gate is enforced."

---

## L5 · Planner and adaptation

**Maps to:** M3 · **gstack:** `/review` (this is core logic, review carefully)

**Prompt**

```
Phase L5: Planning engine and adaptation. PRD section 5 is the exact spec. Epic C.

1. Implement the planner in src/lib/planner as pure functions with no I/O:
   - capacity(goal, today): per study day, weekly_hours * 60 / number of study days, rounded
     down to 5 minute steps
   - schedule(skills, prereqs, progress, capacity, reviews): topological order, ties broken by
     priority (high first), difficulty (low first), then id. Fill days, max 60 minutes per
     session, a skill may span sessions, a skill never starts before its prerequisites end.
   - mvd(item): 15 to 20 minutes, from the skill's mvd_minutes and mvd_task
   - unscheduled tail when work exceeds capacity
2. Review blocks: spaced review minutes are inserted before new learning, capped at 15 minutes
   a day.
3. POST /goals/:id/plan/generate runs the planner and writes plan_items with a plan_version.
   GET /plan?from=&to= reads a range.
4. Adapt (C4): trigger when 2 or more sessions are missed in a rolling 7 days, or weekly
   completion is under 60 percent of planned minutes. POST /plan/adapt applies exactly one of:
   compress (shorten remaining sessions, never below MVD), extend (new target date shown
   before saving), add_time (higher weekly hours for a set number of weeks, then revert),
   reduce_scope (per-skill confirmation). Each writes goal_changes. Never silently remove or
   move a prerequisite after its dependent.
5. Reschedule (C5): a missed item moves to the next day with free capacity within 7 days.
   Never push a week over weekly hours without confirmation. An item missed 3 times triggers
   the adapt prompt.
6. Screens: Plan (S07) with a week view (Gantt, lazy-loaded) and day list (Task Rows), and the
   Adapt sheet (S17) with Radio Group, Dialog, Alert. Copy: "You missed 2 sessions this week.
   Pick how to catch up."

Tests: determinism (same input, identical output, byte for byte, run 100 times); prerequisites
never violated (property test over random valid graphs); capacity never exceeded; MVD always
present and never above the planned minutes; each adapt option produces a valid plan and a
goal_changes row; reduce_scope without confirmation changes nothing; reschedule respects weekly
hours.
```

**Verify**
- [ ] Generate the data engineering plan, inspect a full week
- [ ] Mark items missed in the seed, see the adapt prompt trigger
- [ ] Each adapt option shows a before and after before applying
- [ ] Property tests pass

**Carry forward:** "L5 done. Deterministic planner, MVD, review insertion, adapt and reschedule are in. Plan items exist per day."

---

## L6 · Daily loop and offline

**Maps to:** M4 · **gstack:** `/review`, then `/qa`

**Prompt**

```
Phase L6: Today screen, check-in, and offline sync. Epic C3, D1, D2 and PRD section 10.
Screens S08, S09.

1. GET /today returns today's primary session, its MVD version, the review block if due, and
   check-in status. Build the Today screen (S08) with Task Rows, Progress and one primary
   button. If no plan exists, show an Empty State with one action: generate a plan.
2. Check-in sheet (S09) in a Drawer with Radio Group: Done, Partial, Missed, MVD only. Optional
   minutes and a reason chip (no time, unwell, client work, too hard, too easy, other). Target:
   open to saved in under 30 seconds. Optimistic UI.
3. POST /check-ins is idempotent by client_id. Show "MVD complete" separately from "planned
   complete".
4. Start session: one tap opens the linked material in the viewer or the external resource in
   a new tab. A timer is optional. Never auto-mark an item done because time passed.
5. Offline (PRD section 10): Dexie stores goals (active), skills, plan items for the next 14
   days, pending check-ins, pending attempts, pending journal entries, today payload, due
   reviews, and cached chunks for materials linked to the active goal.
6. Outbox: every offline write is stored with client_id, operation, payload. A sync loop runs
   on reconnect and on focus, pushes in order, removes on success, backs off on failure and
   shows a banner. Conflict rules exactly as PRD section 10.
7. Service worker: cache the app shell, Today route data, and the viewer assets. Show a status
   line: "No signal. 2 changes will sync when you are back online." Actions that need the
   network are disabled with a reason, not hidden.
8. Today first paint reads from Dexie, then refreshes from the server.

Tests: idempotency (same client_id twice makes one row); offline check-in then reconnect syncs
once with no duplicates; Today renders from cache with the network blocked (Playwright offline
mode); outbox order is preserved; conflicting skill edit follows the documented rule and shows
the note; check-in flow completes in under 30 seconds in a scripted run.
```

**Verify**
- [ ] Airplane mode: open Today, check in, reconnect, see one row on the server
- [ ] Median check-in time on your phone is under 30 seconds
- [ ] Network-only actions are disabled with a reason
- [ ] Lighthouse PWA check passes the installable criteria

**Carry forward:** "L6 done. Today, check-in, session start, offline store and outbox work. Sync is idempotent."

**Pause here for a `/qa` sweep and a week of real use before building further. The daily loop is the product.**

---

## L7 · Quizzes, grading and evidence

**Maps to:** M5 · **gstack:** `/review` (grading logic), `/qa`

**Prompt**

```
Phase L7: Quizzes, AI grading, overrides, evidence. Epic E and PRD sections 6 and 7.
Screens S10, S11.

1. POST /skills/:id/quizzes enqueues make_quiz. Retrieve chunks for the skill's confirmed
   materials, pass only those chunks to the AI. Questions must cite source_chunk_ids that
   exist in the retrieved set. Any other id is removed. Recall questions need an answer key.
   Applied and artifact questions need a rubric of 3 to 5 criteria, weights summing to 100.
   Reject quizzes that break these rules and retry once.
2. Quiz screen (S10) with Question Card, Radio Group, Textarea, Progress. The rubric is shown
   before the user answers an applied question. GET /quizzes/:id never returns recall answer
   keys.
3. Recall (multiple choice, true or false) is marked deterministically on the server. No AI.
4. Applied answers: POST /questions/:id/attempts (idempotent by client_id) then a grade_applied
   job. The grade has score per criterion (0 to 2), total (0 to 100), verdict (pass at 70 or
   above), feedback per criterion, and confidence. Confidence under 0.6 sets the attempt to
   needs_your_review and awards nothing until the user confirms.
5. Pending grades: if the AI is paused or unavailable, the attempt is saved as pending_grade and
   graded later. Copy: "AI is paused until tomorrow. Your answer is saved and will be graded
   then." The user can self-grade in the meantime (source self, never counted as E2).
6. Grade review (S11) with Accordion, Badge, Dialog: show the rubric, the scores, the
   feedback and the model version. Override any criterion or the verdict with a required short
   reason. Store the override as a new grade row with source user_override, set is_current on
   it, and keep the original AI grade for audit. Write an audit_events row.
7. Artifact answers (text or file): graded against the rubric with the same override rules. The
   app does not execute user code. If the user supplies an expected output, show a "Confirm
   you ran it and it matched" tick. Only that tick grants E3.
8. Evidence engine (src/lib/evidence): implements PRD 6.1 to 6.3 exactly. A skill is verified
   by E2 or above within 30 days, or E1 for recall-only skills. Verification type self never
   verifies. Update skills.status, evidence_level, verified_at. Verified skills create a
   skill_reviews row (interval 1 day).
9. Show evidence strength next to every skill (E0 to E3) with a plain label: "Self-rated",
   "Quiz passed", "Applied, graded", "Artifact checked".

Tests: schema rejection (missing answer key, weights not 100, unknown chunk id); recall marking
is deterministic and needs no AI call; confidence under 0.6 routes to needs_your_review and
awards no evidence; override stores a new row and keeps the original; pending_grade resolves
when the cap resets; self-rated skills never become verified; E3 only after the user's confirm
tick; the evidence engine passes a table of cases from PRD section 6.
```

**Verify**
- [ ] Take a recall quiz and an applied question end to end
- [ ] Force a low-confidence grade, confirm it needs your review
- [ ] Override a grade, see both rows and the audit event
- [ ] A skill with only self-rating shows "Self-rated" and is not verified

**Carry forward:** "L7 done. Quizzes, deterministic recall marking, AI grading with confidence routing, overrides and the evidence engine are in."

---

## L8 · Tutor and journal

**Maps to:** M6 · **gstack:** `/review`

**Prompt**

```
Phase L8: Tutor Q&A and journal. Epics F and G1. Screens S12, S13.

1. Ask screen (S12) using Chat Panel, Streaming Answer, Citations. POST /conversations then
   POST /conversations/:id/messages enqueues answer_question with retrieved chunks. The reply
   cites chunk ids. Remove any citation id that is not in the retrieved set. If nothing
   supports the answer, label it "General knowledge, not from your materials" and set
   general_knowledge on the message.
2. Conversations are saved per skill and listed.
3. POST /messages/:id/explain with a style: simpler, more technical, with an example. Each call
   counts against the AI cap.
4. "Add to journal" copies an answer into a journal entry. "Make this a flashcard" saves a
   question and answer pair to saved_cards for that skill. Saved cards appear in the review
   block as a self-rated card (evidence stays E0). A flip-card UI is out of scope for v0.1.
5. Journal (S13) with a Rich Text Editor (lazy-loaded) and Timeline. Optional mood 1 to 5 and
   optional links to a check-in or a skill. Edits create a new version. Journal entries are
   stored and never sent to the AI. A weekly summary may be offered, and it runs only when the
   user taps "Summarise my week", and only on structured stats unless the user also ticks "Include my
   journal".
6. Offline: journal entries and drafts work offline through the outbox.
7. Health-flagged goals show a standing note on the Ask screen: "This is for learning. It is
   not medical advice."

Tests: citations not in the retrieved set are stripped; unsupported answer is labelled as
general knowledge; journal text never appears in any AI request unless the explicit option is
ticked (inspect the mock provider calls); explain styles produce distinct requests; journal
edit creates a new version; offline journal write syncs.
```

**Verify**
- [ ] Ask about a topic from an uploaded PDF, see citations that open the right passage
- [ ] Ask something unrelated to your materials, see the general knowledge label
- [ ] Inspect the mock provider log: no journal text in any request
- [ ] Journal works in airplane mode

**Carry forward:** "L8 done. Grounded tutor, explain styles, saved cards and the journal are in. Journal is never sent to the AI by default."

---

## L9 · Progress and spaced review

**Maps to:** M7 · **gstack:** `/review`

**Prompt**

```
Phase L9: Progress view and spaced review. Epic G2 and G3. Screens S14, S15.

1. Spaced review (src/lib/review, pure): after a pass, intervals go 1, 3, 7, 14, 30 days. A fail
   resets to 1 day. Update skill_reviews and set skills.status to needs_review when a review is
   missed or the last evidence is older than 30 days.
2. GET /review/due returns due items. The Today review block is capped at 15 minutes. Review
   uses short recall questions from existing quizzes, plus saved cards (self-rated).
3. Review queue screen (S15) with Question Card and an Empty State: "Nothing due today."
4. GET /progress returns: verified skills over time, planned versus done minutes per week, MVD
   streak, evidence mix (E0 to E3 counts), skills due for review.
5. Progress screen (S14) with Stat, Time Series Chart (lazy-loaded), and Gauge. The
   plain-language weekly summary is generated from data by code, not by AI. If an AI summary is
   shown, label it "Written by AI".
6. MVD streak counts days with an MVD or better. A missed day resets nothing silently: show
   "Streak paused" with the count kept, and offer to restart. No guilt copy.

Tests: interval table for pass and fail paths; needs_review transitions; review block never
exceeds 15 minutes; progress stats match seeded data exactly; the weekly summary text is
produced without any AI call.
```

**Verify**
- [ ] Pass a review, see the next due date at the right interval
- [ ] Fail a review, see it come back tomorrow
- [ ] Progress numbers match what you did in the seed
- [ ] Charts load lazily (check the bundle report)

**Carry forward:** "L9 done. Spaced review, progress stats and the review queue are in."

---

## L10 · Resource discovery

**Maps to:** M8 · **gstack:** `/review`, then `/qa`

**Prompt**

```
Phase L10: Resource discovery with vetting. Epic B3 and B4. Screen S06.

1. SearchProvider interface with a mock and a real adapter for a search API that has a free
   tier. Choose the provider at build time. Check its current free limits first and record
   them in the README. Add a daily search cap in config.
2. POST /goals/:id/resources/discover enqueues a job. Steps: search_queries task makes up to 3
   queries per skill that lacks material or needs depth. The search provider returns
   candidates. NO URL comes from the model. Reject any resource whose URL did not come from
   the search provider (enforce with a test).
3. Vetting: HTTP check (200 or a redirect to 200), dedupe by normalised URL, store title and
   domain. Dead links are dropped and counted in logs. classify_resource runs in batches of up
   to 10 candidates and returns type, estimated minutes and relevance 0 to 1.
4. Show source type, estimated minutes, the skill it supports, and why it was suggested (the
   query). Store provenance on each row (found_by_query, search_provider, found_at).
5. Approval queue (S06) with Checklist and Card. Approve per resource or per skill. Nothing
   enters the plan until approved. Reject and "Not useful" remove it and add the URL to a
   per-goal exclusion list so it is never suggested again.
6. Approved resources attach to plan items for their skill. Re-run the planner only if the
   user confirms.
7. The job shows progress and may take minutes. It respects the AI and search caps and pauses
   cleanly.

Tests: a model-proposed URL not in the search results is rejected; dead links dropped; duplicates
merged; excluded URLs never reappear; approval gate blocks unapproved resources from the plan;
cap reached pauses the job with a visible message.
```

**Verify**
- [ ] Run discovery for three skills, review candidates, approve some
- [ ] Every approved resource opens a live page
- [ ] Rejected resources never return on a second run
- [ ] A forced bad URL from the mock model is rejected

**Carry forward:** "L10 done. Discovery is search-sourced only, vetted, approval-gated, with provenance."

---

## L11 · Reminders

**Maps to:** M9 · **gstack:** `/review`

**Prompt**

```
Phase L11: Reminders and weekly check-in. Epic H and PRD section 11.

FIRST: check the cron interval allowed on the Vercel plan in use and report it to me. If
minute-level cron is not available, implement the schedule through Supabase pg_cron calling the
protected route, or fall back to one daily send plus an in-app prompt. Tell me which you chose
and why.

1. Reminder settings (GET and PUT /reminders): daily time, weekdays, email on or off, push on
   or off, weekly review day. Settings screen (S16) using the Settings Page layout, Switch and
   Select.
2. POST /cron/reminders (CRON_SECRET header). For each user due now: skip if today's primary
   session is already done. Dedupe with reminder_log. Send through EmailProvider and
   PushProvider (mock in dev, real in production).
3. Web push: VAPID keys, POST /push/subscribe, opt-in per device from an installed PWA. Show an
   honest note on iOS: "Push works on iPhone only when Learnitt is added to your home screen.
   Email is the backup."
4. Copy is specific and calm: "Today: Dimensional modelling, 45 min. Minimum version: 15 min."
5. Weekly check-in (H2): planned versus done, one question about what got in the way, and the
   adapt prompt if triggered.
6. Real email: add a provider with a free tier, verify its current limits, record them.

Tests: reminder fires only when the day is incomplete; dedupe prevents a second send; weekdays
respected; timezone respected (user timezone from profile, including a daylight saving change);
mock providers record exact payloads for assertion; the cron route rejects a missing or wrong
secret.
```

**Verify**
- [ ] A reminder arrives by email at the set time, and not after you complete the day
- [ ] Push works on Android Chrome (installed)
- [ ] Wrong cron secret returns 401
- [ ] The cron interval decision is written in the README

**Carry forward:** "L11 done. Reminders and the weekly check-in work. Cron approach is documented."

---

## L12 · Hardening

**Maps to:** M10 · **gstack:** `/review`, `/qa`

**Prompt**

```
Phase L12: Hardening. This phase adds no features.

1. Account controls (Epic I): export all data as JSON and original materials as a zip
   (POST /export). Delete goal, and delete account (typed confirmation) removing rows, storage
   objects and queued jobs. Settings shows AI usage against the cap and the consent toggle.
2. Security pass: re-run the RLS suite; add rate limits per user on every AI-triggering route
   and per IP on auth; confirm upload checks; confirm signed URL expiry; run a dependency audit;
   confirm no secrets in the client bundle; confirm the service role key is used only by the
   worker and cron routes.
3. Retention job: purge ai_cache and job payloads older than 30 days; keep usage counters 13
   months.
4. Performance (PRD section 14): measure and fix. Today cached first paint under 1 second on a
   mid-range Android over 4G, Today JS under 180 KB gzipped, heavy components lazy-loaded,
   check-in perceived save under 100 ms. Report numbers.
5. Accessibility: automated axe on every screen plus a manual keyboard pass. Touch targets
   44 by 44 px. Reduced motion respected. Fix everything found.
6. Backups: a script that exports the database and the materials bucket to a private location,
   plus a runbook entry for weekly use. Note the Supabase free-tier pause behaviour and the
   decision point to upgrade.
7. Error and empty states: every list has an Empty State, every async action has loading and
   error states, every error says what happened and what to do next.
8. README and runbook: local setup, env vars, provider setup, migrations, cron, backups, and
   the conflict and risk list from PRD section 16.

Tests: export contains every owned row and nothing else; delete leaves no rows or objects for
that user; rate limits trigger; axe finds no serious or critical issues; bundle budget check
runs in CI.
```

**Verify**
- [ ] Export, then delete the account, then confirm nothing remains
- [ ] Lighthouse PWA and accessibility 90 or above
- [ ] Performance numbers reported against the targets
- [ ] Backup script restores into a fresh local project

**Carry forward:** "L12 done. Export, delete, rate limits, budgets, accessibility and backups are in."

---

## L13 · Pilot setup

**Maps to:** M11 · **gstack:** `/qa` (full sweep), `/ship`

**Prompt**

```
Phase L13: Pilot setup. Prepare six months of real use.

1. Production: Vercel production project, Supabase production project, environment variables,
   cron configured, real email and push verified, custom domain optional.
2. Seed nothing fake in production. Create my real data engineering goal through the app:
   8 hours a week, 6 months, Monday to Friday.
3. Metrics (PRD section 18): add an internal Metrics page for me only, showing MVD rate, weekly
   adherence, median check-in time, verified skills, evidence mix, AI calls per day, override
   rate.
4. Monthly review template: a one-page markdown generated from the metrics, with "what worked,
   what did not, what to change in prompts or the planner".
5. Run a full QA sweep: every screen, every button, every state, online and offline, light and
   dark, 360 px to 1440 px. Fix what is broken. Write the report to /qa/pilot-start.md with
   anything flagged but not fixed.
6. Tag v0.1.0.

Tests: the full suite is green on the production build; the sweep report shows no open
critical issues.
```

**Verify**
- [ ] You can complete a full day on your phone, online and offline
- [ ] The metrics page shows real numbers after three days
- [ ] The QA report has no open critical items

---

## Operator notes

- **Order matters.** L1 before everything that stores data. L2 before anything that calls AI. L5 before L6. L7 needs materials from L4.
- **Pause after L6.** Use the daily loop for a week before building more. If you do not open it unprompted by day 7, fix check-in friction before adding features.
- **Keep the PRD current.** When a decision changes, edit `Learnitt_PRD.md` first, then tell the agent which section changed.
- **Free-tier limits move.** Re-check the AI, search and email free limits at L2, L10 and L11, and again before the pilot.
- **Small clarification to the PRD:** F1 mentions "make this a flashcard". This pack implements it as a saved question and answer pair shown in the review block as a self-rated card. A flip-card UI is a later item.
