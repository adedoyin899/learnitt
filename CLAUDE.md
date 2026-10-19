# Learnitt

Goal-agnostic learning companion. Mobile-first PWA with an offline daily loop.
The source of truth is `Learnitt_PRD.md` in the repo root. Read it fully before starting any phase. If a prompt conflicts with the PRD, stop and ask.

## Stack
- Next.js App Router, TypeScript strict, Tailwind CSS
- opendraft component library (Radix primitives, design tokens in `app/globals.css`, motion in `lib/motion.ts`)
- Linear dark style reference (`linear design.md`: `#08090a` void canvas, `#e4f222` acid lime accent, hairline borders)
- Supabase: Postgres, Auth (Google, magic link, email OTP), Storage. RLS on every table.
- Dexie (IndexedDB) for offline store and outbox.
- Zod for request validation and AI structured responses.
- Vitest for unit/integration tests, Playwright for e2e.
- Hosting: Vercel. Local: Supabase CLI.

## Repo Layout
- `src/app`: routes and route handlers under `src/app/api/v1`
- `src/lib/ai`: provider seam, tasks, prompts, cache, usage
- `src/lib/planner`: pure planning functions, no I/O
- `src/lib/retrieval`: chunking and search
- `src/lib/sync`: Dexie schema, outbox, sync loop
- `src/lib/env.ts`: zod-validated environment
- `supabase/migrations`: SQL migrations
- `tests`: unit, integration, e2e

## Invariants
1. Every user-owned table has `owner_id` and RLS (`owner_id = auth.uid()`). A test proves user A cannot read or write user B's rows on every table.
2. Mock mode: every external dependency (AI, search, email, push) is an interface with a real and a mock implementation. The whole app runs and all tests pass with zero real keys.
3. No model names in business logic. Provider and model come from config. AI output is always validated against a zod schema. Invalid output is retried once, then fails visibly.
4. The AI never produces a URL the user sees. Resource URLs come only from the search provider, and must pass a liveness check.
5. The planner is a pure, deterministic function. Same inputs, same output.
6. Never silently remove or reorder a skill. Any scope change needs user confirmation and a `goal_changes` row.
7. Evidence rules from PRD section 6 are exact. A self-rated skill is never "verified".
8. Journal text never goes to the AI unless the user explicitly asks for a summary.
9. The server decides state and access. The client displays and queues.
10. No secrets in the client bundle. The build fails if a service key string appears in client output.

## UX Copy Rules
- No em dashes. Use commas or full stops.
- Voice: direct and explanatory, like Kuda, Moniepoint or Carbon. Say what happened and what to do next. No cleverness, no filler, no guilt.
- Examples of the right tone:
  "You missed 2 sessions this week. Pick how to catch up."
  "AI is paused until tomorrow. Your answer is saved and will be graded then."
  "No signal. 2 changes will sync when you are back online."
- Examples of the wrong tone: "Oops!", "You're falling behind!", "Let's get back on track".

## Working Rules
- One phase at a time (following `Learnitt_PromptPack.md`). Finish, run tests, commit, then stop for review.
- Tests are part of the phase. A phase is not done until its tests exist and pass in CI.
- Atomic commits with clear messages.
- Additive migrations only after L1 ships. No renames, no drops without asking.
- If blocked, state clearly what is blocking. Do not guess.
