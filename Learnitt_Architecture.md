# Learnitt · Phase 1: Brainstorm and Architecture

**Status:** Final for build · **Owner:** Maz
**Part of a set of three:** `Learnitt_Architecture.md` (this file), `Learnitt_PRD.md`, `Learnitt_PromptPack.md`

---

## 1. Locked decisions

| Area | Decision |
|---|---|
| Name | Learnitt |
| Product | Goal-agnostic learning companion. Mobile-first PWA with an offline daily loop |
| Frontend | Next.js (App Router), TypeScript, Tailwind, opendraft component library |
| Data, auth, storage | Supabase (Postgres, Auth with Google, magic link and email OTP, Storage), Row Level Security on every table |
| Offline | IndexedDB through Dexie, synced to Postgres |
| Hosting | Vercel |
| AI | Free or cheap provider behind a swappable seam. AI grading is allowed and every grade is visible and overridable |
| Time budget | 8 hours a week for 6 months |
| First goal | Data engineering. Health analytics is the second test goal. The engine is industry-agnostic |
| Scope | One user first (Maz), multi-user-ready data model |

---

## 2. Pressure test (the `/office-hours` method, applied by hand)

**The problem.** Plans go stale, nobody checks progress, and "learn X by date Y" has no honest finish line. Most tools generate a plan once and stop. They do not adapt when you miss a week, they do not test whether you understood, and they do not carry your own research forward.

**The wedge.** Plan generation is table stakes. The product is the **adapt loop with evidence**: the app reschedules when you fall behind, tests what you claim to know, and tells you honestly what you have not proven yet.

**First user.** A self-directed adult with a goal, a deadline, a limited weekly budget, and existing materials. Maz is user zero.

**What would prove it is real.** Not sign-ups. Ask whether you open it on day 30 without a reminder. If you do, the loop works. If you do not, the check-in friction or the plan quality is the problem, and you find that out before building more.

**Narrowest viable scope.** One user, one active goal, 12 to 20 skills, and the daily loop done well. Everything else waits.

---

## 3. The core loop

**Goal, then Materials, then Plan, then Daily execution, then Reflect and test, then Adapt.**

The last step is the one that matters. Without it, Learnitt is a static plan with a nicer interface.

---

## 4. Domain-agnostic model

Every goal reduces to the same objects. The engine does not know what SQL is. It knows that a skill has prerequisites, a verification type, and a review schedule.

| Object | What it is | Data engineering example |
|---|---|---|
| Goal | Outcome, deadline, weekly hours, starting level | "Junior data engineer in 6 months, 8 hrs a week, beginner" |
| Skill graph | Concepts with prerequisites | SQL, then Python, then modelling, then orchestration, then warehouse |
| Evidence | How you prove a skill | A query returns the right output, a pipeline passes tests |
| Resources | Your uploads plus vetted finds, each linked to skills | Your PDF on dimensional modelling linked to 3 skills |
| Plan | The graph scheduled against your hours | Mon: SQL joins, 45 min. Wed: Airflow DAG, 60 min |
| Check-in | Done, partial, missed, with a reason | "Missed Wed, client call ran long" |
| Review queue | Spaced repetition on covered skills | Joins due again in 4 days |

Domain knowledge lives in the content the AI generates and you edit, not in the code.

---

## 5. Verifying mastery

Domains differ in how verifiable they are, so each skill declares which evidence counts.

| Type | Evidence | Strength |
|---|---|---|
| Auto-checkable | Queries against a dataset, code that passes tests | Strongest |
| Recall | Quizzes and flashcards | Good for theory and vocabulary |
| Applied, AI-graded | A written explanation or design decision graded against a visible rubric | Medium, overridable |
| Self-reported with proof | A recording plus a self-rated rubric (instruments, speaking) | Weakest. Never counts as verified |

**Rule:** the app never implies a skill is mastered when the only evidence is your own rating. Each skill shows its evidence level, E0 to E3.

---

## 6. Architecture

**App layer.** Next.js App Router with TypeScript and Tailwind. Route handlers hold business logic and AI calls.

**Data and auth.** Supabase Postgres, Auth, and Storage. Row Level Security on every table means a missing check in one route cannot leak another user's rows. This is the tenant boundary and it makes the friends-later step safe.

**Offline.** Dexie holds the daily loop: today's plan, check-ins, quiz answers, journal, and cached materials. Writes queue in an outbox and sync when you reconnect. Offline writes are safe here because the data carries no money and no bookings. Plan generation, resource discovery, and AI grading need a connection, and the UI says so.

**AI layer.** A provider-agnostic seam with these tasks: build a skill graph, link materials to skills, generate search queries, classify resources, make quizzes, grade applied answers, answer questions, explain at another level, summarise a week. Outputs are validated against schemas, cached by task and input, and limited by a daily cap per deployment and per user. Model names live in config only.

**Resource discovery.** Search, then a quality filter: liveness check, dedupe, source type, relevance. The model never supplies a URL. Every resource stores its provenance and waits for your approval before it enters the plan.

**Reminders.** Web push from an installed PWA first, with email as the reliable fallback. A scheduled job triggers sends. iOS push is limited, so a Capacitor wrapper stays on the list if reminders do not hold up.

**Long AI jobs.** Run on a queue, not inline, because serverless time limits are too short for discovery and quiz generation.

```
Browser (Next.js PWA)
  |-- Dexie store + outbox  <---- offline daily loop
  |-- opendraft components
  v
Route handlers (/api/v1)  ----> Supabase (Postgres + RLS, Auth, Storage)
  |
  |-- AI provider seam (mock | free-tier model | fallback)
  |-- Search provider seam (mock | real)
  |-- Email and push providers (mock | real)
  v
Job queue (ai_jobs) <---- worker route, called by cron
```

---

## 7. Component library (opendraft)

opendraft is a React component system installed as source through a shadcn registry, built on Radix, with design tokens in `app/globals.css` and motion in `lib/motion.ts`. That layout fits Next.js, so the stack follows it.

| Need in the app | Component |
|---|---|
| Lesson and roadmap navigation | Step Navigation, Stepper, Gantt |
| Daily plan items with progress | Task Rows, Checklist, Progress |
| Quizzes | Question Card, Radio Group, Alert |
| Asking questions | Chat Panel, Streaming Answer, Citations |
| Sources for found resources | Context Cards, Citations |
| Reading uploaded research | Document Viewer, Dropzone |
| Journal | Rich Text Editor, Timeline |
| Progress over time | Stat, Time Series Chart, Gauge |
| Check-ins and notices | Date Picker, Toast, Alert, Drawer |
| Sign in | Auth Screen, OTP Input |
| Empty and loading states | Empty State, Skeleton |
| Later: speaking practice | Voice Button, Live Waveform, Audio Player, Transcript Viewer |

**Gaps to build ourselves later:** flip-card flashcards with review intervals, a music keyboard and chord diagrams, sheet music, a metronome, a personal-time week planner, and a streak heatmap.

**Checks before a client-facing release**
1. Licensing: the docs say the ElevenLabs-adapted components are MIT. A licence for the rest of the library was not found. Confirm ownership or permission for commercial use.
2. Dependency weight: some components pull in heavy packages (MapLibre, Tiptap, Shiki, a WebGL orb). Install only what the MVP uses and lazy-load the editor, viewer, charts, and Gantt.

---

## 8. What a first version could miss, and how the design handles it

- **Minimum viable day.** Every plan item has a 15 to 20 minute version. Without a floor, missed days turn into guilt and the habit ends.
- **Adapt needs a choice, not silence.** When you fall behind, the app offers trade-offs and never drops a skill quietly.
- **Check-in friction.** The daily check-in must take under 30 seconds. If it is heavy, nothing else works.
- **Invented resources.** The AI can fabricate links, so every URL comes from search and passes a liveness check.
- **Uploads and copyright.** Uploads are private, sent to the AI only as retrieved chunks, and only after consent.
- **Spaced repetition.** What you learned in week 1 returns in week 6.
- **Free-tier fragility.** Limits change. The provider seam, cache, and daily cap keep the app working when AI pauses.
- **Scope creep** is a bigger risk than the technology.

---

## 9. MVP boundary

**In:** goal setup with an AI skill graph you can edit, feasibility check, uploads and retrieval, the plan with minimum viable days, daily check-ins, recall and applied quizzes with AI grading and overrides, tutor questions with citations, journal, progress, spaced review, resource discovery with approval, reminders, offline daily loop.

**Out for now:** friends and sharing, speaking and audio evaluation, payments, calendar sync, multiple active goals, native apps.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Free AI limits change or drop | Provider seam, fallback provider, caching, daily cap, graceful pause |
| One shared free key across users | Per-user sub-budget, revisit when a second user joins |
| AI grades badly or invents content | Visible rubrics, confidence threshold, overrides, URL-from-search rule |
| iOS push is unreliable | Email fallback, Capacitor wrapper if needed |
| Plan feels punitive when behind | Compress first, minimum viable day always available, no guilt copy |
| Skill graph quality varies by domain | You edit the graph, and edits are logged |

---

## 11. Open decisions

Defaults used in the PRD and prompt pack are shown. Change them before the goals and plan work begins (prompt L3).

1. **Study days.** Default Monday to Friday, about 96 minutes a day.
2. **Verification for applied skills.** Default: your confirmed override counts as E2, and `artifact` skills need E3 with your confirmation of the expected output.
3. **First real run.** Default: data engineering is the live goal, and your health analytics plan is a test fixture for the import path.

---

## 12. Next documents

- `Learnitt_PRD.md`: user stories with acceptance criteria, data model, API, planner and AI specs, offline rules, deployment, and test plan.
- `Learnitt_PromptPack.md`: 14 copy-paste prompts (L0 to L13) that build the PRD one milestone at a time.
