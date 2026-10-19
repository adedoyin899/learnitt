# Learnitt · Product Requirements Document v0.1

**Status:** Draft for build · **Owner:** Maz · **Audience:** Maz, Claude Code / Antigravity, reviewers
**Companion:** Phase 3 prompt pack (to be generated from this PRD)

---

## 0. Locked decisions

| Area | Decision | Why |
|---|---|---|
| Name | Learnitt | Confirmed |
| App | Next.js (App Router), TypeScript, Tailwind, opendraft components (Radix) | Component library is built for this stack |
| Data and auth | Supabase Postgres, Supabase Auth, Supabase Storage, Row Level Security on every table | Reuses Monologg setup; RLS is the tenant boundary for future sharing |
| Hosting | Vercel | Confirmed |
| Offline | IndexedDB via Dexie, synced to Postgres | Daily loop must work without signal |
| AI provider | Free tier of a Google Gemini Flash-Lite class model, behind a provider seam, with a second free provider as fallback | Cost is zero at personal scale. Free limits are per project and change often, so the code must not assume a model name or quota |
| Weekly capacity | 8 hours per week, 6 months | Confirmed |
| Grading | AI grading on applied answers, every grade visible and overridable by the user | Confirmed |
| Scope | Single user first, multi-user-ready data model, any industry | Confirmed |
| First goal | Data engineering. Health analytics is the second fixture | Confirmed |

**Verify before build:** the exact free-tier model names and daily request limits at the time of build. Check them in the provider's rate-limit console. Design for the lowest published daily limit, not the highest.

---

## 1. Problem and users

**Problem.** Self-directed learners make a plan once and then drift. Nothing adapts when they miss days, nothing checks whether they understood, and "learn X by date Y" has no honest finish line. Existing tools generate plans but don't hold you to them.

**Primary user.** An adult with a concrete goal, a deadline, a limited weekly budget (about 8 hours), and existing materials (courses, PDFs, notes). Maz is user zero.

**Core job to be done.** "Tell me what to do today, make me prove I learned it, and tell me honestly if I'm behind."

**North star metric.** Minimum-viable-day completion rate: the share of active days on which the user completes at least the minimum viable session.

### Goals
- G1. Turn a goal plus materials into a skill graph and a schedule that fits the weekly budget.
- G2. Make the daily loop take under 5 minutes, including check-in.
- G3. Verify understanding with evidence, and label every skill with how strong that evidence is.
- G4. Adapt when behind: show trade-offs, never silently drop content.
- G5. Work offline for the daily loop.
- G6. Stay goal-agnostic: the same engine runs data engineering, health analytics, a language, or an instrument.

### Non-goals (v0.1)
- Sharing, friends, teams, or social features
- Payments or subscriptions
- Native mobile apps (PWA first)
- Automated grading of audio or video (speaking and instruments are self-assessed with an artifact, see §6.4)
- Calendar sync
- Multiple simultaneous active goals (one active goal at a time; others are archived)

---

## 2. Core concepts (glossary)

| Term | Definition |
|---|---|
| **Goal** | Outcome, target date, weekly hours, self-rated starting level, and domain tag. |
| **Skill** | A teachable unit with an estimated effort, a difficulty, a verification type, and zero or more prerequisites. |
| **Skill graph** | Directed acyclic graph of skills by prerequisite. |
| **Material** | Something the user provided: PDF, text, link, note. Private to the owner. |
| **Resource** | Something the app found or the user added: article, video, exercise. Has provenance and an approval state. |
| **Plan item** | A skill (or a part of one) scheduled to a date and session, with a duration. |
| **Session** | A time block of study (for example, 45 min). The unit of daily work. |
| **Minimum viable day (MVD)** | The smallest acceptable day: 15 to 20 minutes of one defined task. |
| **Check-in** | The user's report for a plan item: done, partial, or missed, with an optional reason. |
| **Quiz** | A set of questions tied to skills. Question types: recall, applied, artifact. |
| **Evidence level** | E0 self-claim, E1 recall passed, E2 applied passed (AI-graded or user-verified), E3 artifact passed (checked). |
| **Review** | A spaced re-test of a skill already covered. |
| **Journal entry** | Free-text reflection, optionally linked to skills or check-ins. |

---

## 3. Epics and user stories

Each story has acceptance criteria (AC). Stories are ordered by build dependency.

### Epic A · Goals and skill graph

**A1. Create a goal.** As a user, I describe a goal, target date, weekly hours, and starting level, so the app can plan.
- AC1. Required fields: title, target date (must be future), weekly hours (1 to 20, default 8), starting level (beginner, intermediate, advanced), domain (free text with suggestions).
- AC2. Saving creates a goal in status `draft`. Only one goal may be `active`. Creating a second active goal prompts the user to archive the first.
- AC3. Dates and hours are stored in the user's timezone, and the timezone is stored on the profile.

**A2. Generate a skill graph.** As a user, I get a proposed skill list and prerequisites for my goal.
- AC1. The AI returns 12 to 20 skills, each with: name, one-sentence description, prerequisites (by skill id), estimated minutes (range), difficulty (1 to 5), verification type (recall, applied, artifact, self).
- AC2. The response must validate against the skill-graph schema (§7.3). Invalid responses are retried once, then the user is told generation failed and can retry.
- AC3. The graph is checked for cycles. A cycle is rejected and the AI is asked to fix it once.
- AC4. The user can add, rename, remove, reorder, and edit estimates. Every edit is saved and the plan is recalculated (§5).

**A3. Feasibility check.** As a user, I see whether the goal fits my time budget before I commit.
- AC1. Feasibility = total estimated minutes of the graph, divided by available minutes between today and the target date, using weekly hours.
- AC2. Three bands: **feasible** (under 85% of capacity), **tight** (85 to 100%), **not feasible** (over 100%).
- AC3. If tight or not feasible, the app shows three options: extend the date, increase weekly hours, or reduce scope (with the list of skills proposed for removal, lowest priority first). The user picks one. The app never removes skills without confirmation.

**A4. Import an existing plan.** As a user, I paste or upload an existing plan (for example, my health analytics plan) and the app converts it into a skill graph.
- AC1. Accepts pasted text, .md, or .txt. Phases and weeks become skills or clusters. The user reviews the result before saving.
- AC2. Imported content is stored as a material linked to the goal, so the original stays available.

### Epic B · Materials and resources

**B1. Upload materials.** As a user, I attach my own research, notes, or links so the app can use them.
- AC1. Accepts PDF, .md, .txt, .docx, and URLs. Max 20 MB per file, 200 MB per user in v0.1.
- AC2. Files are stored in a private Supabase Storage bucket. Access is only through signed URLs issued to the owner.
- AC3. Text is extracted, chunked (about 800 tokens with 100 overlap), and indexed with Postgres full-text search (tsvector). No embeddings in v0.1.
- AC4. Extraction failures are shown with the reason. The file stays, marked `needs_attention`.

**B2. Link materials to skills.** As a user, I see which skills my materials cover, and which skills have no material yet.
- AC1. The AI proposes links with a confidence score. Links above 0.7 are auto-suggested, below that are shown as weak.
- AC2. The user confirms or removes links. Confirmed links are never overwritten by a later AI run.

**B3. Discover resources.** As a user, I get vetted resources for skills that have no material or need more depth.
- AC1. The AI generates search queries per skill. The search provider returns candidate URLs.
- AC2. **No URL shown to the user comes from the model directly.** Every URL must come from search results.
- AC3. Each candidate is checked: it resolves (HTTP 200 or redirect to 200), it is not a duplicate, and the page title and domain are stored. Dead links are dropped silently and counted in logs.
- AC4. Each candidate shows source type (course, article, video, book, exercise, official docs), estimated minutes, and the skill it supports.
- AC5. Nothing enters the plan until the user approves it. Approval can be bulk (per skill) or per resource.
- AC6. Discovery runs as a background job and shows progress. It may take minutes.

**B4. Resource provenance and quality.** As a user, I can see where a resource came from and why it was suggested.
- AC1. Each resource stores: source URL, found-by query, search provider, found-at timestamp, and the skill it supports.
- AC2. Resources can be marked `not useful`. That removes them from the plan and feeds a per-goal exclusion list.

### Epic C · Plan and adaptation

**C1. Generate a plan.** As a user, I get a day-by-day plan that fits my weekly hours.
- AC1. The plan respects prerequisites: a skill is never scheduled before all its prerequisites are scheduled earlier or marked verified.
- AC2. Each day has at most one primary session (the planned block) and an optional review block.
- AC3. Session length defaults to weekly hours divided by study days (default 5 days): for 8 hours, 96 minutes per day, split into sessions of at most 60 minutes.
- AC4. Every plan item has: skill, task type (learn, practise, apply, review, quiz), duration, the material or resource attached, and a minimum viable version.
- AC5. The plan is deterministic: same inputs produce the same plan (see §5.2).

**C2. Minimum viable day.** As a user, I can always do something small and count it.
- AC1. Each plan item has a minimum viable version of 15 to 20 minutes (for example, "re-read the first section and write three bullet points").
- AC2. Completing the MVD counts toward the day. The check-in shows "MVD complete" separately from "planned complete".

**C3. Check in on a day.** As a user, I log what I did in under 30 seconds.
- AC1. Check-in offers one-tap: Done, Partial, Missed, MVD only. Each has optional minutes and an optional reason chip (no time, unwell, client work, too hard, too easy, other).
- AC2. Submitting is idempotent per plan item per day.
- AC3. Check-in works offline and syncs later (§9).

**C4. Adapt when behind.** As a user, when I fall behind, I see my options and choose.
- AC1. Trigger: two or more missed sessions in a rolling 7 days, or weekly completion below 60% of planned minutes.
- AC2. The app proposes up to three options: (a) compress: shorten remaining items to fit, (b) extend: move the target date, (c) add time: increase weekly hours for a set period, (d) reduce scope: defer or drop low-priority skills (with confirmation).
- AC3. The app never silently removes a skill or moves a prerequisite after its dependent.
- AC4. The chosen option is recorded in the goal's change log with timestamp and reason.

**C5. Reschedule a missed item.** As a user, a missed item moves to the next free slot within seven days, so I don't lose it.
- AC1. Missed items move to the next day with free capacity. Items missed three times trigger the adapt prompt (C4).
- AC2. Rescheduling never pushes weekly load above weekly hours without the user's confirmation.

### Epic D · Daily loop

**D1. Today screen.** As a user, I open the app and see exactly what today is.
- AC1. Shows: today's primary session, the MVD version, the review block if due, and the one check-in button.
- AC2. Loads from the local store first. Shows a "last synced" time when offline.
- AC3. If no plan exists yet, shows an empty state with a single action: generate a plan.

**D2. Start a session.** As a user, I open the material or resource for the session in one tap.
- AC1. Opens the linked material in the in-app viewer (PDF, text) or opens the external link in a new tab.
- AC2. A session timer is optional. The app never auto-checks an item because time passed.

### Epic E · Quizzes and grading

**E1. Generate a quiz for a skill.** As a user, I can test a skill I'm working on.
- AC1. Quiz types per question: recall (multiple choice, true/false, short answer), applied (open response with a rubric), artifact (user submits a file, link, or text, graded by rubric).
- AC2. Questions are grounded in linked materials: the AI receives retrieved chunks, not the whole library. Each question stores its source chunk ids.
- AC3. Recall questions are checked deterministically where possible (multiple choice and true/false are auto-marked from the answer key).
- AC4. Quizzes are stored, so the same quiz can be retaken and compared over time.

**E2. AI-graded applied answers.** As a user, my written answers are graded against a rubric I can see.
- AC1. Each applied question has a rubric of 3 to 5 criteria, each with a description and a weight, generated with the question and visible before answering.
- AC2. The grader returns: score per criterion (0 to 2), total (0 to 100), verdict (pass at 70 or above), feedback per criterion, and confidence (0 to 1).
- AC3. If confidence is below 0.6, the result is marked `needs_your_review` and does not award E2 until the user confirms.
- AC4. The grade, its rubric, and the model version are stored with the attempt.
- AC5. **Overrides:** the user can change any criterion score or the verdict, with a required short reason. The override is stored, and the original AI grade is kept for audit.
- AC6. If the AI is unavailable, the answer is saved and marked `pending_grade`. Pending answers are graded when the job queue runs. The user is told they're pending. The user can self-grade in the meantime.

**E3. Artifact checks.** As a user, I submit proof of work for skills that produce something (a SQL query, a pipeline, a note).
- AC1. Artifacts are text (code, query, notes) or file uploads.
- AC2. Text artifacts are graded by the AI against the rubric, with the same override rules as E2.
- AC3. The app does not execute user code in v0.1. Verification is by rubric and optional expected output that the user provides (for example, "this query should return 12 rows").
- AC4. Where the user supplies expected output, the app compares it to the user's stated result, and records a match as E3 only when the user confirms the run.

**E4. Mastery threshold.** As a user, a skill counts as verified only with evidence.
- AC1. A skill is `verified` when it has E2 or higher evidence within the last 30 days, or E1 for recall-only skills.
- AC2. Self-rated skills are never `verified`. They stay at E0 and display a "self-rated" label.

### Epic F · Tutor and questions

**F1. Ask about what I'm learning.** As a user, I ask questions and get explanations grounded in my materials.
- AC1. Answers cite the material chunks they used. If no chunk supports an answer, the app says so and offers a general explanation labeled as such.
- AC2. Conversations are saved per skill. The user can see past answers.
- AC3. Each answer offers "make this a flashcard" and "add to journal".

**F2. Break down a concept.** As a user, I ask for a simpler explanation or an example.
- AC1. Explain-level control: simpler, more technical, with an example, with a diagram description. Each produces a new answer. Costs count against the daily budget (§7.6).

### Epic G · Journal and progress

**G1. Journal.** As a user, I write about my progress, and the app links entries to what I did.
- AC1. Free-text entries with optional mood (1 to 5) and optional links to a check-in or skill.
- AC2. Entries are private and encrypted at rest through Supabase defaults. No AI reads journal entries unless the user explicitly asks for a summary.

**G2. Progress view.** As a user, I see how I'm improving, not only how busy I was.
- AC1. Shows: skills verified over time, weekly planned vs done minutes, MVD streak, evidence mix (E0 to E3), and skills due for review.
- AC2. Shows a plain-language weekly summary built from data, not from AI speculation. Any AI-written summary is labelled as such.

**G3. Spaced review.** As a user, I get reminded to revisit skills before I forget them.
- AC1. Review intervals after a pass: 1, 3, 7, 14, 30 days. A failed review resets the interval to 1 day.
- AC2. Review items appear in the Today screen as a separate block, capped at 15 minutes.

### Epic H · Reminders and check-ins

**H1. Daily reminder.** As a user, I get a reminder at a time I choose.
- AC1. User sets a daily reminder time and which weekdays.
- AC2. Delivery channels in v0.1: web push (installed PWA) and email. Push is opt-in per device.
- AC3. Reminders only fire if the day's plan is not already complete.
- AC4. Reminder text is direct and specific: "Today: Dimensional modelling, 45 min. MVD: 15 min." No guilt copy.

**H2. Weekly check-in.** As a user, I get a short weekly review prompt.
- AC1. Sent on a day the user chooses. Shows planned vs done, one question about what got in the way, and the adapt prompt if triggered.

### Epic I · Account, settings, and data control

**I1. Sign in.** As a user, I sign in with Google, a magic link, or an email OTP.
- AC1. Uses the Supabase Auth setup from Monologg. Same providers, same redirect handling.
- AC2. A profile row is created on first sign-in.

**I2. Settings.** As a user, I control my AI usage, reminders, and data.
- AC1. Toggle: "send my materials to the AI for quizzes and questions" (default on, with a note on what is sent).
- AC2. Shows AI usage this week against the cap (§7.6).
- AC3. Export: download all my data as JSON and my materials as originals.
- AC4. Delete: delete goal, or delete account. Deletion removes rows, storage objects, and queued jobs. Confirmation requires typing the goal name.

**I3. Privacy notice in-app.** As a user, I know what leaves my device.
- AC1. Before the first AI call that uses my materials, the app shows what will be sent (material name, chunk count) and asks once.

---

## 4. Screens

| Code | Screen | Purpose | Key components (opendraft) |
|---|---|---|---|
| S01 | Sign in | Auth | Auth Screen, OTP Input |
| S02 | Goal setup wizard | Create goal, feasibility | Stepper, Field, Date Picker, Slider, Alert |
| S03 | Skill graph editor | Review and edit skills | Step Navigation, Repeater Field, Dialog |
| S04 | Materials library | Upload, link, status | Dropzone, Table, Badge, Empty State |
| S05 | Material viewer | Read a PDF or text | Document Viewer, Tabs |
| S06 | Resource review | Approve discovered resources | Checklist, Card, Toast |
| S07 | Plan | Week and day view, adapt prompt | Gantt (week), Task Rows, Alert |
| S08 | Today | Daily loop | Task Rows, Button, Progress, Checklist |
| S09 | Check-in sheet | Done, partial, missed | Drawer, Radio Group, Textarea |
| S10 | Quiz | Take quiz, see rubric | Question Card, Radio Group, Textarea, Progress |
| S11 | Grade review | See grade, override | Accordion, Badge, Dialog, Textarea |
| S12 | Ask | Tutor questions | Chat Panel, Streaming Answer, Citations |
| S13 | Journal | Entries | Rich Text Editor, Timeline |
| S14 | Progress | Charts and evidence | Stat, Time Series Chart, Gauge |
| S15 | Review queue | Spaced review | Question Card, Empty State |
| S16 | Settings | Reminders, AI, data | Settings Page layout, Switch, Select |
| S17 | Adapt sheet | Choose a recovery option | Radio Group, Dialog, Alert |

Opendraft components are used as-is. Gaps (flashcards with flip and intervals, a music keyboard and chord diagrams for later goals) are not in v0.1. The Feasibility gauge reuses Gauge.

---

## 5. Planning engine

### 5.1 Inputs
- Skill graph: nodes with `estimated_minutes`, `difficulty`, `prereq_ids`, `verification_type`, `priority` (1 to 3)
- Goal: `target_date`, `weekly_hours`, `timezone`, `study_days` (default Mon to Fri)
- Progress: completed minutes per skill, verified status
- Existing commitments: user-blocked days or time (optional, v0.1 supports blocked weekdays only)

### 5.2 Algorithm (deterministic)
1. **Capacity.** For each day from today to target date, capacity = `weekly_hours × 60 / len(study_days)` for study days, 0 otherwise. Rounded down to 5-minute steps.
2. **Remaining work.** Sum of `estimated_minutes × (1 − progress)` per skill. Add review minutes projected from spaced intervals (capped at 15 min per day).
3. **Topological order.** Sort skills by prerequisites. Ties broken by `priority` (higher first), then `difficulty` (lower first), then `id` (stable).
4. **Fill.** Walk days in order and fill capacity with skill chunks (max 60 minutes per session). A skill may span multiple sessions. A skill's session can't start before its prerequisite's last session ends.
5. **MVD.** Each session gets an MVD: the first 15 to 20 minutes of the task, defined as the smallest meaningful unit (set by the AI at skill creation and editable).
6. **Feasibility.** If total remaining work exceeds total capacity, the plan marks the tail as `unscheduled` and triggers the feasibility band logic (A3).

Determinism: same inputs produce the same output. Random elements are not allowed in the planner. Tests assert this.

### 5.3 Adapt rules
- **Compress:** reduce the duration of remaining sessions proportionally to fit capacity. Never below MVD.
- **Extend:** recalculate with a new target date. Show the new date before saving.
- **Add time:** recalculate with higher `weekly_hours` for a period set by the user (for example, 3 weeks), then revert.
- **Reduce scope:** list candidates (priority 1 skills last, skills with no dependents first). Require confirmation per skill.

### 5.4 Review scheduling
Review items are inserted at spaced intervals after a skill is verified (§3 G3). They consume capacity before new learning on the same day, capped at 15 minutes.

---

## 6. Evidence and mastery model

### 6.1 Evidence levels

| Level | Meaning | Example |
|---|---|---|
| E0 | Self-claim | "I think I get joins" |
| E1 | Recall passed | 8 out of 10 on a quiz |
| E2 | Applied passed | AI-graded answer at 70+, or user-verified after override |
| E3 | Artifact passed | Query output matches stated expected result, user-confirmed |

### 6.2 Skill status
`not_started` → `learning` (any plan item started) → `practising` (any quiz or artifact attempted) → `verified` (evidence threshold met, §E4) → `needs_review` (review due and missed, or verified more than 30 days ago without review).

### 6.3 Verification type per skill
- `recall`: E1 is sufficient to verify
- `applied`: E2 required
- `artifact`: E3 preferred, E2 accepted if the artifact cannot be checked
- `self`: never verified. Stays E0 with a "self-rated" label.

### 6.4 Domains where evidence is weaker
Speaking, musical instruments, and other embodied skills can't be AI-graded from text in v0.1. For these, the artifact is a recording the user uploads and a self-assessment against a rubric. The app records these as `self` evidence with artifact attached, and labels them clearly. Automated audio assessment is a v2 item.

---

## 7. AI layer

### 7.1 Provider seam
```ts
interface AIProvider {
  id: string;                      // "gemini-flash-lite", "fallback-x"
  generateStructured<T>(args: {
    task: AITask;                  // enum, see 7.2
    system: string;
    user: string;
    schema: JSONSchema;            // validated after response
    maxOutputTokens: number;
    temperature: number;           // 0.2 for planning and grading
  }): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number }; modelVersion: string }>;
}
```
- Providers are configured by environment variable. No code change to swap.
- Fallback: if the primary returns rate-limit or server errors, the job is retried once, then sent to the fallback provider if configured.
- No model names in business logic. The model name lives in config.

### 7.2 AI tasks
| Task | Input | Output | Temperature |
|---|---|---|---|
| `skill_graph` | goal, level, domain, optional material outline | skill graph (7.3) | 0.2 |
| `link_materials` | skills, material chunk summaries | skill-to-material links with confidence | 0.1 |
| `search_queries` | skill, level | up to 3 search queries | 0.3 |
| `classify_resource` | page title, snippet, domain | type, estimated minutes, relevance 0 to 1 | 0.1 |
| `make_quiz` | skill, retrieved chunks, question mix | questions with answer keys and rubrics (7.4) | 0.4 |
| `grade_applied` | question, rubric, answer | criterion scores, verdict, feedback, confidence | 0.1 |
| `answer_question` | question, retrieved chunks, skill | answer with chunk citations | 0.3 |
| `explain_level` | prior answer, requested style | rewritten explanation | 0.4 |
| `weekly_summary` | structured stats only | plain-language summary | 0.3 |

### 7.3 Skill graph schema (abridged)
```json
{
  "skills": [
    {
      "id": "sk_1",
      "name": "string, max 80 chars",
      "description": "string, one sentence",
      "prereq_ids": ["sk_0"],
      "estimated_minutes": { "min": 60, "max": 120 },
      "difficulty": 1,
      "verification_type": "recall | applied | artifact | self",
      "mvd_minutes": 15,
      "mvd_task": "string, max 140 chars"
    }
  ]
}
```
Validation: 12 to 20 skills, unique ids, prerequisites exist, no cycles, `estimated_minutes.min ≤ max`.

### 7.4 Quiz schema (abridged)
```json
{
  "questions": [
    {
      "id": "q1",
      "type": "recall_mc | recall_tf | applied | artifact",
      "prompt": "string",
      "options": ["..."],
      "answer_key": "string or index (recall only)",
      "rubric": [{ "criterion": "string", "weight": 40, "description": "string" }],
      "source_chunk_ids": ["chk_1"],
      "skill_id": "sk_1"
    }
  ]
}
```
Rules: every question cites at least one `source_chunk_id` when materials exist. Recall questions have an answer key. Applied and artifact questions have a rubric with weights summing to 100.

### 7.5 Grounding and citations
- The AI only sees retrieved chunks, never the whole library.
- Any citation id not in the retrieved set is removed before display.
- Answers with no supporting chunk are labelled "general knowledge, not from your materials".

### 7.6 Cost control (free tier)
- **One shared free key.** Free limits are per project, so all users of a deployment share the quota. For personal use this is fine. The app must still assume it could hit the limit at any time.
- **Hard daily cap** in config, set below the lowest published daily limit (for example, 300 calls per day). Each user gets a sub-budget.
- **Usage counters** per user per day in `usage_counters`. The UI shows remaining budget.
- **Caching.** Cache key = hash(task, input hash, provider, prompt version). Skill graphs, quizzes, classifications, and search queries are cached. Cache hits don't count toward the cap.
- **Batching.** Resource classification runs over batches of up to 10 candidates per call.
- **Degrade gracefully.** When the cap is hit, the app keeps working for planning, check-ins, and review. AI-dependent actions queue with a clear message: "AI is paused until tomorrow. Your answer is saved."
- **Prompt versioning.** Every prompt has a version string stored with outputs, so changes can be audited.

### 7.7 Quality and safety
- Temperature 0.1 to 0.3 for planning, grading, and linking. Higher only for quiz wording.
- Output must validate against schema. Invalid output is retried once, then the job fails with a visible reason.
- The system prompt states that the model must not invent URLs, citations, or facts about the user.
- Medical or legal content: where materials are health-related (the health analytics fixture), the app adds a standing note that content is educational and not clinical advice. Stored as a per-goal flag.

---

## 8. Data model (Supabase Postgres)

All user-owned tables include `owner_id uuid not null references auth.users(id)` and RLS policies `owner_id = auth.uid()` for select, insert, update, delete. Timestamps are `timestamptz`. IDs are `uuid` with `gen_random_uuid()`.

```sql
-- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/London',
  ai_materials_consent boolean not null default false,
  ai_consent_asked_at timestamptz,
  created_at timestamptz not null default now()
);

-- goals
create table goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  domain text,
  starting_level text not null check (starting_level in ('beginner','intermediate','advanced')),
  target_date date not null,
  weekly_hours numeric(4,1) not null check (weekly_hours between 1 and 20),
  study_days smallint[] not null default '{1,2,3,4,5}', -- ISO weekday numbers
  status text not null default 'draft' check (status in ('draft','active','paused','archived','completed')),
  health_flag boolean not null default false,
  graph_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_goal_per_owner on goals(owner_id) where status = 'active';

-- skills
create table skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  name text not null,
  description text,
  estimated_min_minutes int not null,
  estimated_max_minutes int not null check (estimated_max_minutes >= estimated_min_minutes),
  difficulty smallint not null check (difficulty between 1 and 5),
  priority smallint not null default 2 check (priority between 1 and 3),
  verification_type text not null check (verification_type in ('recall','applied','artifact','self')),
  mvd_minutes smallint not null default 15 check (mvd_minutes between 10 and 30),
  mvd_task text,
  status text not null default 'not_started' check (status in ('not_started','learning','practising','verified','needs_review')),
  evidence_level smallint not null default 0 check (evidence_level between 0 and 3),
  verified_at timestamptz,
  position int not null default 0,
  source text not null default 'ai' check (source in ('ai','user','import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- prerequisites
create table skill_prereqs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  prereq_id uuid not null references skills(id) on delete cascade,
  primary key (skill_id, prereq_id),
  check (skill_id <> prereq_id)
);

-- materials (private)
create table materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references goals(id) on delete cascade,
  kind text not null check (kind in ('pdf','text','markdown','docx','url','plan_import')),
  title text not null,
  storage_path text,              -- private bucket path, null for url
  source_url text,
  byte_size bigint,
  content_hash text,
  status text not null default 'pending' check (status in ('pending','ready','needs_attention')),
  status_reason text,
  created_at timestamptz not null default now()
);

-- chunks for retrieval
create table material_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  ordinal int not null,
  content text not null,
  tokens int not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored
);
create index material_chunks_fts on material_chunks using gin(fts);

-- material-to-skill links
create table skill_material_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  confirmed boolean not null default false,
  primary key (skill_id, material_id)
);

-- resources (discovered or user-added)
create table resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  skill_id uuid references skills(id) on delete set null,
  url text not null,
  title text,
  domain text,
  type text check (type in ('course','article','video','book','exercise','docs','other')),
  estimated_minutes int,
  relevance numeric(3,2),
  found_by_query text,
  search_provider text,
  approval text not null default 'pending' check (approval in ('pending','approved','rejected')),
  status text not null default 'ok' check (status in ('ok','dead','duplicate')),
  found_at timestamptz not null default now(),
  unique (goal_id, url)
);

-- plan items
create table plan_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  skill_id uuid references skills(id) on delete cascade,
  scheduled_date date not null,
  kind text not null check (kind in ('learn','practise','apply','review','quiz')),
  planned_minutes int not null check (planned_minutes between 5 and 120),
  material_id uuid references materials(id) on delete set null,
  resource_id uuid references resources(id) on delete set null,
  mvd_minutes int not null,
  status text not null default 'planned' check (status in ('planned','rescheduled','unscheduled','done','partial','missed','mvd_only')),
  plan_version int not null default 1,
  rescheduled_from date,
  position int not null default 0
);
create index plan_items_owner_date on plan_items(owner_id, scheduled_date);

-- check-ins (append-only; latest per item wins for display)
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_item_id uuid not null references plan_items(id) on delete cascade,
  outcome text not null check (outcome in ('done','partial','missed','mvd_only')),
  minutes_actual int check (minutes_actual between 0 and 480),
  reason text check (reason in ('no_time','unwell','client_work','too_hard','too_easy','other')),
  note text,
  client_id uuid not null,           -- offline idempotency key from device
  created_at timestamptz not null default now(),
  unique (owner_id, client_id)
);

-- quizzes and questions
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  prompt_version text not null,
  model_version text,
  created_at timestamptz not null default now()
);
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references quizzes(id) on delete cascade,
  position int not null,
  type text not null check (type in ('recall_mc','recall_tf','applied','artifact')),
  prompt text not null,
  options jsonb,
  answer_key jsonb,
  rubric jsonb,
  source_chunk_ids uuid[] not null default '{}'
);

-- attempts and grades
create table attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references quiz_questions(id) on delete cascade,
  answer_text text,
  answer_file_path text,
  status text not null default 'submitted' check (status in ('submitted','pending_grade','graded','needs_your_review')),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, client_id)
);
create table grades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null references attempts(id) on delete cascade,
  source text not null check (source in ('ai','user_override','self','mc_auto')),
  criterion_scores jsonb,
  total smallint check (total between 0 and 100),
  verdict text check (verdict in ('pass','fail')),
  feedback jsonb,
  confidence numeric(3,2),
  model_version text,
  override_reason text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

-- tutor
create table conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references goals(id) on delete cascade,
  skill_id uuid references skills(id) on delete set null,
  created_at timestamptz not null default now()
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  cited_chunk_ids uuid[] not null default '{}',
  general_knowledge boolean not null default false,
  created_at timestamptz not null default now()
);

-- journal
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  mood smallint check (mood between 1 and 5),
  linked_check_in_id uuid references check_ins(id) on delete set null,
  linked_skill_id uuid references skills(id) on delete set null,
  created_at timestamptz not null default now()
);

-- spaced review state
create table skill_reviews (
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  interval_days smallint not null default 1,
  due_on date not null,
  last_result text check (last_result in ('pass','fail')),
  primary key (skill_id)
);

-- adapt decisions
create table goal_changes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  change_type text not null check (change_type in ('compress','extend','add_time','reduce_scope','graph_edit','import')),
  detail jsonb not null,
  created_at timestamptz not null default now()
);

-- AI jobs, cache, usage
create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task text not null,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','paused_cap')),
  attempts smallint not null default 0,
  result_ref jsonb,
  last_error text,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create index ai_jobs_queue on ai_jobs(status, run_after);

create table ai_cache (
  cache_key text primary key,
  task text not null,
  provider text not null,
  prompt_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table usage_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (owner_id, day)
);

-- reminders and push
create table reminder_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  daily_time time,
  weekdays smallint[] not null default '{1,2,3,4,5}',
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  weekly_review_day smallint default 0
);
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- audit for auth-sensitive and override actions
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
```

**Storage:** bucket `materials` (private). Object path `{owner_id}/{material_id}/{filename}`. Storage policies allow the owner to read and write only their own prefix.

**Why supabase-js with RLS, not Prisma, for this project:** the Monologg backend enforces authorization in application code. For Learnitt, RLS means a missing check in one route cannot leak another user's rows. That matters more once friends are added. Server routes that need elevated access (job worker, cron) use the service role key and are limited to the job table.

---

## 9. API

Route handlers under `/app/api/v1`. All routes require an authenticated session except where marked. All request bodies are validated with zod. All responses use a common envelope `{ data, error }`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/goals` | Create goal (draft) |
| GET | `/goals/active` | Active goal with summary |
| PATCH | `/goals/:id` | Edit goal fields |
| POST | `/goals/:id/activate` | Set active (archives previous if confirmed) |
| POST | `/goals/:id/skill-graph` | Enqueue skill-graph generation |
| GET | `/goals/:id/feasibility` | Feasibility band and options |
| PATCH | `/skills/:id` | Edit skill (name, estimates, priority, prereqs) |
| POST | `/goals/:id/skills` | Add skill |
| DELETE | `/skills/:id` | Remove skill (requires confirmation flag) |
| POST | `/goals/:id/plan/generate` | Generate or regenerate plan |
| GET | `/plan?from=&to=` | Plan items in range |
| POST | `/plan/adapt` | Apply adapt option (body: option, params) |
| POST | `/materials` | Create material (returns signed upload URL) |
| POST | `/materials/:id/process` | Enqueue extraction and chunking |
| GET | `/materials` | List materials |
| DELETE | `/materials/:id` | Delete material and storage object |
| POST | `/goals/:id/resources/discover` | Enqueue discovery |
| GET | `/goals/:id/resources?approval=pending` | Review queue |
| PATCH | `/resources/:id` | Approve, reject, mark not useful |
| POST | `/check-ins` | Submit check-in (idempotent by client_id) |
| POST | `/skills/:id/quizzes` | Enqueue quiz generation |
| GET | `/quizzes/:id` | Quiz with questions (no answer keys for recall) |
| POST | `/questions/:id/attempts` | Submit attempt (idempotent by client_id) |
| GET | `/attempts/:id` | Attempt with current grade |
| POST | `/grades/:id/override` | Override grade (requires reason) |
| POST | `/conversations` | Start conversation for skill |
| POST | `/conversations/:id/messages` | Ask question (enqueues answer job) |
| POST | `/messages/:id/explain` | Explain at another level |
| GET | `/journal` | Entries |
| POST | `/journal` | Create entry |
| GET | `/progress` | Stats for progress view |
| GET | `/review/due` | Due reviews |
| GET | `/today` | Today's payload (plan, MVD, reviews) |
| GET/PUT | `/reminders` | Reminder settings |
| POST | `/push/subscribe` | Save push subscription |
| GET | `/jobs/:id` | Job status (polling, v0.1) |
| GET | `/usage` | AI usage today and week |
| POST | `/export` | Build export archive |
| DELETE | `/account` | Delete account (requires typed confirmation) |
| POST | `/cron/reminders` | Cron (secret header required, not user-facing) |
| POST | `/cron/worker` | Job worker tick (secret header required) |

**Idempotency.** Any write that can happen offline includes `client_id`. The server treats a repeat as success and returns the original row.

**Job pattern.** Long AI work returns `202` with `{ job_id }`. The client polls `/jobs/:id` every 3 seconds while visible, then backs off to 15 seconds. A worker tick claims queued jobs with a lease (`locked_until`), runs at most a few jobs per tick, and respects the daily cap.

---

## 10. Offline and sync

**Local store (Dexie).** Mirrors: goals (active), skills, plan items (next 14 days), check-ins (pending), attempts (pending), journal entries (pending), today payload, review due, and cached material chunks for the active goal's linked materials.

**Outbox.** Every offline write goes into an `outbox` table with `client_id`, operation, payload, and created time. A sync loop runs when online and on app focus. It pushes in order and removes items on success. Failures back off and show a banner.

**Conflicts.**
- Check-ins and attempts: append-only, no conflicts.
- Plan items: server wins for scheduling. Local check-in status is merged as a separate row.
- Skill edits: last write wins per field, with server timestamp. The UI shows a note if a conflict was overwritten.
- Journal: append-only. Edits create a new version.

**What works offline:** Today screen, check-ins, opening cached materials, reading cached chunks, writing journal, answering quiz questions (grading queued), reviewing progress from cached data.

**What needs a connection:** goal creation and skill-graph generation, plan regeneration, material upload and processing, resource discovery, AI grading and tutor answers (queued), account actions.

**The UI states this clearly.** A status line shows "Offline. 2 changes waiting to sync." Actions that need the network are disabled with a reason, not hidden.

---

## 11. Reminders

- **Delivery:** web push for installed PWA users (opt-in per device), email for everyone.
- **Scheduling:** a cron route runs every minute if the platform allows it. If it doesn't on the chosen Vercel plan, use Supabase `pg_cron` to call the route, or a daily send with client-side scheduling as fallback. **Verify the platform's minimum cron interval before build.** This is an open risk (§16).
- **Logic:** for each user due a reminder now, if today's primary session is not marked done, send the reminder. Dedupe with `reminder_log(owner_id, kind, day)`.
- **iOS:** push works only for installed PWAs and is unreliable. The email channel is the reliable fallback. Capacitor wrap is the upgrade path if push is not good enough.

---

## 12. Security and privacy

- **RLS on every table.** Tests assert that user A cannot read or write user B's rows for every table.
- **Private storage.** No public bucket URLs. Signed URLs with short expiry (5 minutes) for the owner only.
- **Upload checks.** File type by magic bytes, size limits, filename sanitised, content hash for dedupe. PDF and DOCX are parsed in a sandboxed route with timeouts.
- **AI data minimisation.** The AI receives retrieved chunks only, with an explicit consent flag on the profile (I2, I3). Journal entries never leave the database unless the user asks for a summary.
- **Secrets.** Provider keys and the service role key live in Vercel environment variables. Never in the client bundle. A build check fails if a service key string appears in client output.
- **Rate limits.** Per user on all AI-triggering routes. Per IP on auth.
- **Retention.** Materials and journal kept until deleted. AI cache and job payloads purged after 30 days. Usage counters kept 13 months.
- **Data protection.** UK GDPR applies (the user is UK-based). Privacy notice, export, deletion, and a record of processing are required before any user other than Maz signs up.
- **Health content.** Goals flagged `health_flag` show the educational-content note (§7.7). Health analytics materials may include patient-level examples. Only use public or synthetic data as materials.

---

## 13. Accessibility and UX standards

- WCAG 2.2 AA, aligned with the Monologg design system work.
- Every interactive element has keyboard access, a visible focus state, and an accessible name. Opendraft components are Radix-based and inherit this, but custom screens must be checked.
- Touch targets at least 44 by 44 px.
- Motion respects `prefers-reduced-motion`.
- Copy is direct and specific. No guilt copy when someone misses a day. Errors say what happened and what to do next.
- Dark mode uses the opendraft theme toggle.

---

## 14. Performance targets

| Metric | Target |
|---|---|
| Today screen, cached, first paint | under 1 s on mid-range Android over 4G |
| Today screen, online, interactive | under 2 s |
| Check-in save, perceived | under 100 ms (optimistic) |
| Quiz load | under 1.5 s |
| Client JS on Today route | under 180 KB gzipped (lazy-load charts, editor, viewer) |
| Lighthouse PWA and accessibility | 90 or above |

Lazy-load: Rich Text Editor, Document Viewer, Time Series Chart, Gantt, Video Player. These are the heavy opendraft components.

---

## 15. Deployment and environments

- **Environments:** `local` (Supabase local via CLI, all AI in mock mode), `preview` (Vercel preview deployments against a Supabase dev project), `production` (Vercel production, Supabase production project).
- **Mock mode.** Every AI provider, search provider, email, and push has a mock implementation returning deterministic fixtures. The full app runs with zero keys. Same provider seam as Monologg.
- **Config.** All env vars validated at boot with zod. Required: Supabase URL and keys, AI provider key (or mock flag), search provider key (or mock flag), email provider key (or mock), cron secret, VAPID keys for push.
- **Migrations.** Supabase migrations in version control. Additive where possible. Every migration reviewed before production.
- **CI.** Typecheck, lint, unit tests, RLS tests against a local Supabase, build. Block merge on failure.
- **Backups.** Supabase free tier has no automated backups. Schedule a weekly export of the database and storage bucket to a private location, or move to the Pro plan before the first real use.
- **Free-tier notes.** Supabase free projects pause after about a week of inactivity. Use the daily reminder cron or a keep-alive ping while the project is in use. Cost review at month 3.
- **Domain.** Custom domain optional for v0.1. Use the Vercel default URL.

---

## 16. Risks and open questions

| # | Risk or question | Impact | Mitigation or decision needed |
|---|---|---|---|
| R1 | Free AI limits change or drop | Grading and generation stop | Provider seam, fallback provider, daily cap, cache, graceful pause |
| R2 | Shared free key across users | One heavy user uses everyone's quota | Per-user sub-budget; revisit when a second user joins |
| R3 | AI invents resources or grades badly | Trust collapses | URL-from-search rule, dead-link checks, approval gate, overrides, confidence threshold |
| R4 | iOS push unreliable | Reminders missed | Email fallback, Capacitor option |
| R5 | Vercel cron minimum interval on plan | Reminders not minute-accurate | Verify plan limits; Supabase pg_cron alternative |
| R6 | Supabase free-tier pause | App unreachable after inactivity | Reminder cron keeps project active; upgrade decision at month 3 |
| R7 | Scope creep into sharing or speech grading | Ship date slips | Non-goals list; v2 parking lot |
| R8 | Adapt engine feels punitive | User quits | Compress first, MVD always, no guilt copy, user chooses |
| R9 | Materials contain copyrighted text | Legal exposure for quoting | AI shows short excerpts only; tutor answers paraphrase; user's own materials stay private |
| R10 | Skill-graph quality varies by domain | Plans feel wrong | User edits; templates for common domains later; log edits to learn |

**Open decisions for Maz:**
1. Exact study days (default Monday to Friday, 96 minutes per day). Confirm or change.
2. Is "E2 by user verification after override" enough for skills like data engineering, or do you want an artifact check on every applied skill?
3. Health analytics fixture: import your existing plan first, or start with data engineering as the first real run?

---

## 17. Test plan (acceptance gates)

**Unit**
- Planner determinism: same inputs produce the same plan, byte for byte.
- Feasibility bands at 84%, 85%, 100%, and 101% of capacity.
- Cycle detection in skill graphs.
- Spaced review intervals (pass and fail paths).
- Quiz schema validation: rejects missing answer keys on recall, rubric weights not summing to 100, unknown chunk ids.
- Grader: confidence below 0.6 routes to `needs_your_review`.
- Cache key stability across identical inputs.

**Integration**
- RLS: every table, both read and write, two users, zero leakage.
- Goal to plan to check-in to adapt, end to end, against seeded data.
- Material upload, extraction, chunking, and full-text retrieval returns the expected chunk.
- Resource discovery: model-proposed URLs that do not come from search results are rejected.
- Daily cap: when reached, AI routes queue and report "paused", and non-AI routes still work.
- Idempotency: replaying the same check-in or attempt `client_id` produces one row.

**Offline**
- Airplane mode: Today renders from cache, check-in saved, sync on reconnect, no duplicates.
- Conflicting skill edits resolve as specified and show the overwrite note.

**Fixtures (industry-agnostic test)**
- Data engineering goal (primary).
- Health analytics goal from the existing plan (import path).
- A non-technical goal (for example, a language or an instrument), to prove the engine doesn't depend on the domain.

**Manual**
- Complete one full week of real use on the data engineering goal. Record the daily-loop time and the number of AI calls used.

---

## 18. Metrics for the six-month run

| Metric | Measure | Target |
|---|---|---|
| Minimum viable day rate | Active days with MVD complete ÷ active days | 80% or above by month 2 |
| Weekly plan adherence | Done plus partial minutes ÷ planned minutes | 70% or above, trending up |
| Check-in time | Median seconds from open to saved check-in | under 30 s |
| Verified skills | Skills at `verified` per month | Tracked, no target in month 1 |
| Evidence mix | Share of verified skills at E2 or E3 | 60% or above |
| AI calls per day | Median and 95th percentile | under daily cap in 95% of days |
| Override rate | Share of AI grades overridden by user | Tracked. High rate means the grader needs work |

Monthly review: one page. What worked, what didn't, what to change in the plan engine or prompts.

---

## 19. Build milestones (feeds Phase 3)

| Milestone | Scope | Exit criteria |
|---|---|---|
| M0 Foundation | Repo, Next.js, Tailwind, opendraft install, Supabase project, auth, RLS skeleton, CI, mock providers | Sign in works; RLS tests green |
| M1 Goal and graph | Goal wizard, feasibility, AI skill graph, graph editor, import | Data engineering graph generated and edited; feasibility shows |
| M2 Materials | Upload, extraction, chunking, full-text retrieval, linking | Upload a PDF; retrieval returns relevant chunks |
| M3 Plan engine | Planner, MVD, adapt options, reschedule | Deterministic plan tests green; adapt flow works |
| M4 Daily loop | Today, check-in, session start, offline cache | Check-in under 30 s; works offline |
| M5 Quizzes and grading | Quiz generation, recall auto-mark, AI grade, overrides, pending grades | Grade shows rubric; override stored |
| M6 Tutor and journal | Conversations with citations, explain-level, journal | Answers cite chunks; no-source answers labelled |
| M7 Progress and review | Progress view, spaced review, weekly summary | Review items appear on schedule |
| M8 Resources | Search provider, discovery job, dead-link checks, approval queue | Only search-sourced URLs reach the user |
| M9 Reminders | Email, push (opt-in), weekly review | Reminder fires only when day incomplete |
| M10 Hardening | Caps, cost dashboard, export, delete, perf, a11y pass | All gates in §17 green; Lighthouse 90 or above |
| M11 Pilot | Six months of real use, monthly reviews | Metrics in §18 reported monthly |

Each milestone maps to one or more prompts in the Phase 3 prompt pack. Each prompt ends with: what to build, how to verify, and what to carry into the next prompt.

---

## Appendix A · Seed fixtures

**Data engineering (primary).** Goal: "Junior data engineer role in 6 months." Starting level: beginner. 8 hours per week. Study days Monday to Friday. Sample graph: SQL fundamentals → data modelling → Python for data → batch pipelines → orchestration (Airflow or equivalent) → cloud storage and warehouse basics → data quality and testing → portfolio project.

**Health analytics (second).** Goal: "MSc Health Analytics application readiness." Starts from the existing plan. Health flag on. Import path tested with the 20-week plan.

**Language (third, non-technical).** Goal: "Hold a 10-minute conversation in a new language in 3 months." Verifies that artifact evidence works for speaking through self-assessment with recordings.

---

## Appendix B · Glossary of statuses

- Goal: `draft`, `active`, `paused`, `archived`, `completed`
- Skill: `not_started`, `learning`, `practising`, `verified`, `needs_review`
- Plan item: `planned`, `rescheduled`, `unscheduled`, `done`, `partial`, `missed`, `mvd_only`
- Attempt: `submitted`, `pending_grade`, `graded`, `needs_your_review`
- Resource: approval `pending`, `approved`, `rejected`; status `ok`, `dead`, `duplicate`
- Job: `queued`, `running`, `succeeded`, `failed`, `paused_cap`
