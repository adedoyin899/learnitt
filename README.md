# Learnitt

> **Goal-agnostic learning companion. Mobile-first PWA with an offline daily loop.**

Learnitt is designed to solve the fatal flaw of self-directed study: plans go stale, nobody checks progress, and goals lack verifiable evidence of mastery. Learnitt combines automated scheduling, an offline daily execution loop, evidence-based verification, and intelligent adaptation when you fall behind.

---

## Local Development (Mock Mode)

Learnitt is built with strict isolation seams: **the entire development environment, test suites, and mock providers run out of the box with zero external API keys.**

### 1. Prerequisites
- **Node.js:** v20+ (tested on v22)
- **Package Manager:** `pnpm` (`npm install -g pnpm`)
- **Supabase CLI:** (optional for local database container, version 2+)

### 2. Quickstart
```bash
# Clone and enter directory
git clone https://github.com/adedoyin899/learnitt.git
cd learnitt

# Install dependencies
pnpm install

# Start local development server in mock mode (no keys required)
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. The app runs in `MOCK_MODE=true` by default:
- External AI, Search, Email, and Push providers resolve to deterministic mock fixtures.
- Protected routes redirect unauthenticated users to `/login`.
- Sign in via Email OTP (using any email and test code `123456`) or Google OAuth.

### 3. Verification & Scripts
```bash
# Typecheck
pnpm run typecheck

# Lint (ESLint 9)
pnpm run lint

# Run Unit & Integration Test Suite (Vitest)
pnpm run test

# Production Build & Client Bundle Secret Leak Check
pnpm run build
```

---

## The Core Loop

1. **Goal Setup & Feasibility:** Define an outcome, target date, starting level, and weekly study budget. The engine generates an editable prerequisite DAG and performs an honest feasibility analysis.
2. **Materials & Resource Discovery:** Upload personal notes, PDFs, or links. The app extracts text chunks for retrieval and pairs skills with vetted external resources without AI hallucination.
3. **Deterministic Planning:** Schedules work against your weekly capacity with daily sessions and a built-in **Minimum Viable Day (MVD)** (15–20 min) version for every task.
4. **Daily Execution (Offline First):** Fast, distraction-free "Today" dashboard with one-tap check-in (<30 seconds) that runs entirely offline via Dexie (IndexedDB) and syncs when reconnected.
5. **Verification & Rubric Grading:** Mastery is graded against evidence levels (E0 to E3). AI-graded written answers include visible rubrics and user overrides. Self-ratings never count as verified.
6. **Adaptation Without Guilt:** When you miss sessions, Learnitt presents clear trade-offs: compress, extend, add time, or reduce scope. It never drops a skill silently.

---

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript (strict), Tailwind CSS
- **Design System:** opendraft components (Radix primitives) styled to a dark precision instrument aesthetic (`#08090a` void canvas, `#e4f222` acid-lime action accent)
- **Data & Auth:** Supabase (Postgres with strict Row Level Security on every table, Auth, Storage with signed URLs)
- **Offline Storage:** Dexie (IndexedDB) with an idempotent outbox sync engine
- **AI Seam:** Provider-agnostic abstraction (Gemini Flash-Lite / fallbacks) with strict Zod validation, request caching, and hard daily quotas
- **Testing:** Vitest for unit & integration, Playwright for end-to-end testing
- **Search Seam:** Provider-agnostic search adapter (`mock`, `tavily`) with vetted candidate extraction and strict anti-hallucination URL invariants

---

## Search Provider Configuration & Free Limits

Learnitt grounds resource discovery in external search providers to prevent AI hallucinations. Candidates are strictly vetted (live HTTP check, SSRF protection, deduplication, URL normalization, and per-goal exclusions).

### Provider Free Tiers
- **Mock Provider (`mock`):** Unlimited deterministic local fixture search with zero external dependencies.
- **Tavily Search API (`tavily`):** Free tier includes **1,000 search API calls/month** (approx. 33 searches/day). Basic search depth with relevance-ranked educational results.
- **Brave Search API (`brave`):** Free tier includes **2,000 requests/month** (approx. 66 searches/day).

### Search Caps & Quotas
- **Daily Search Cap:** Configured in `src/lib/config/search.ts` via `SEARCH_CONFIG.DAILY_SEARCH_CALL_CAP` (default: **50 search queries/day**).
- **Max Queries Per Skill:** Up to 3 targeted queries generated per skill that lacks material or needs depth.
- **Provider Choice:** Configured at build/runtime via `SEARCH_PROVIDER=mock` or `SEARCH_PROVIDER=tavily`. If quota is reached, discovery jobs cleanly pause with `paused_cap` status.

---

---

## Reminders & Cron Scheduling Architecture (L11)

Learnitt delivers calm, specific study prompts and weekly check-ins via Web Push and Email only when the user's primary daily study session is incomplete.

### Vercel Plan Cron Limits vs Architecture Decision
- **Vercel Hobby Plan Restriction:** Vercel Hobby strictly limits cron schedules to **once per day** (minimum interval: 24 hours). Sub-daily or minute-level schedules (`* * * * *`, `*/15 * * * *`) trigger build and deployment errors on Hobby accounts.
- **Decision: Supabase `pg_cron` Calling Protected Cron Route:**
  Minute-level scheduling is managed in Postgres via Supabase's `pg_cron` extension calling `POST /api/v1/cron/reminders` with a secure header (`x-cron-secret: <CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>`).
- **Why this was chosen:**
  1. **Timezone & DST Accuracy:** Users select their preferred daily time (e.g. 09:00) in their local IANA timezone (e.g. `Europe/London`, `America/New_York`, `Asia/Tokyo`). A single once-per-day Vercel cron cannot fire at each user's chosen local hour. Minute-level evaluation accurately triggers reminders regardless of Daylight Saving Time shifts.
  2. **Real-time Completion Awareness:** Reminders only fire if today's primary session is not already completed (`check_ins` status or all `plan_items` marked done). Minute-level ticks prevent sending reminders immediately after a session is completed.
  3. **Supabase Inactivity Prevention:** Supabase free-tier projects pause after a week of inactivity. Scheduled `pg_cron` executions keep the Postgres instance active and ready.
  4. **Vercel Fallback Cron:** `vercel.json` includes a daily fallback cron (`0 8 * * *`) to ensure baseline notifications even if Supabase extensions are not yet configured.

### Reminder Invariants & Delivery Seams
- **Calm, Specific Copy:** Direct copy without guilt: `"Today: Dimensional modelling, 45 min. Minimum version: 15 min."`
- **Deduplication:** Every send records an entry in `reminder_log(owner_id, kind, day)` preventing duplicate dispatches.
- **Weekly Check-In (Epic H2):** Sent on the user's chosen weekly review day (`weekly_review_day`), presenting planned vs completed study hours, a single reflection question ("What got in the way?"), and an adaptation prompt if triggered.
- **Web Push (PWA):** Native Web Push notifications via VAPID with opt-in per device. Honest note on iOS: *"Push works on iPhone only when Learnitt is added to your home screen. Email is the backup."*

---

## Email Provider Configuration & Free Limits (L11)

Learnitt implements an `EmailProvider` seam supporting both deterministic in-memory recording (`mock`) and live email delivery via **Resend** (`resend`).

### Resend Free Tier Limits
- **Daily Quota:** **100 emails/day** (enforced by `ResendEmailAdapter` via `dailyCap`).
- **Monthly Quota:** **3,000 emails/month**.
- **Domains & Verification:** 1 free custom domain with DKIM/SPF verification, or testing deliveries restricted to the account owner email address.
- **Provider Selection:** Controlled via `EMAIL_PROVIDER=resend` (or `mock` in local dev and automated tests).

---

## Hardening & Production Controls (L12)

Phase L12 hardens Learnitt against security, performance, data loss, and accessibility risks with zero new user-facing features added.

### 1. Account Controls (Epic I)
- **Data & Materials Export (`POST /export`):** Exports all user data across all tables as formatted JSON (`learnitt-data.json`) and downloads all original uploaded materials as a single `.zip` archive.
- **Typed Goal Deletion (`DELETE /api/v1/goals/:id`):** Requires typed confirmation matching the exact goal title. Cascades database deletion, deletes associated files from the private materials storage bucket, and cancels queued `ai_jobs`.
- **Typed Account Deletion (`DELETE /api/v1/account`):** Requires typed confirmation `DELETE`. Permanently purges all user rows across every table, removes all files from the storage bucket, cancels queued jobs, and clears authentication session cookies.
- **Settings Screen S16:** Displays daily AI generation usage progress against the cap, estimated 7-day token cost, and the material AI consent toggle (`profiles.ai_materials_consent`).

### 2. Security Pass & Rate Limiting
- **Row Level Security (RLS):** Every user-owned table enforces strict RLS policies (`auth.uid() = owner_id`). Server-only tables (`ai_jobs`, `ai_cache`, `usage_counters`) have empty policies preventing direct client access.
- **Rate Limits:**
  - **AI Routes:** Strictly limited to **20 requests / minute per user** (`checkAiRateLimit`). Exceeded requests return `429 Too Many Requests` with `Retry-After: 60`.
  - **Auth Routes:** Strictly limited to **10 requests / minute per IP** (`checkAuthRateLimit`).
- **File Upload Protection:** Strict magic-byte header validation (rejecting PE `.exe`, ELF, Mach-O binaries renamed to `.pdf` or `.txt`), null byte checks, filename sanitization preventing directory traversal, and 50MB file size limits.
- **SSRF Prevention:** Blocks private, loopback (`127.0.0.1`, `localhost`), and cloud metadata (`169.254.169.254`) IP ranges.
- **Signed URL Expiry:** All storage upload and download URLs strictly expire in **300 seconds (5 minutes)** with zero public storage URLs.
- **Client Bundle Secret Scanning:** Build-time script `scripts/check-bundle-secrets.mjs` scans all static `.js` chunks and aborts build if `SUPABASE_SERVICE_ROLE_KEY` or any private provider secret is detected.
- **Service Role Isolation:** The service role key is strictly isolated to server-side background workers and cron endpoints; never imported in client components.

### 3. Data Retention Job
- **Route:** `POST /api/v1/cron/retention` (protected by `CRON_SECRET`).
- **Automated Schedule:** Runs daily at 03:00 UTC via Supabase `pg_cron` (`20261019000006_retention_cron.sql`).
- **Purge Policies:**
  - `public.ai_cache`: Purged after **30 days**.
  - `public.ai_jobs`: Completed/failed payloads purged after **30 days**.
  - `public.usage_counters`: Preserved for **13 months** for annual tracking, then purged.

### 4. Performance & Budgets (PRD Section 14)
- **Today JS Bundle Size:** Target < 180 KB gzipped. **Actual: 154.95 KB gzipped** (513.08 KB raw).
- **Bundle Budget Check:** Enforced in CI via `pnpm run check:budget` (`scripts/check-bundle-budget.mjs`).
- **Lazy-Loaded Heavy Components:** `TimeSeriesChart`, `DocumentViewer`, `CheckInDrawer`, and `SessionView` are dynamically imported on demand.
- **Cached First Paint:** < 1.0s on mid-range Android over 4G via Dexie IndexedDB cache read before network refresh.
- **Check-in Save Time:** Perceived save < 100ms via optimistic React state updates with asynchronous IndexedDB background flush (< 10ms).

### 5. Accessibility & Touch Targets
- **Automated Axe:** Verified with `@axe-core/playwright` across screens (`/today`, `/plan`, `/progress`, `/review`, `/settings`, `/ask`, `/journal`, `/materials`) with zero serious or critical issues.
- **Touch Targets:** All interactive buttons and controls meet WCAG 2.1 AA **44x44px minimum target size** (`.touch-target-44`).
- **Reduced Motion:** Full `@media (prefers-reduced-motion: reduce)` support disabling spring transitions and infinite animations.

### 6. Backups & Disaster Recovery
- **Backup Script:** `./scripts/backup.sh` and `node scripts/backup.mjs` exports all tables to JSON and storage bucket files to timestamped `.tar.gz` bundles.
- **Restore Script:** `node scripts/restore.mjs` validates restoring into a clean local project in topological foreign-key order.
- **Runbook:** See [docs/runbooks/backups.md](docs/runbooks/backups.md) for weekly procedures, Supabase 7-day auto-pause behavior, and the Pro tier upgrade decision point ($25/mo at 250MB DB size).

---

## PRD Section 16: Risks & Open Questions Matrix

| # | Risk or Question | Impact | Mitigation or Decision Implemented |
|---|---|---|---|
| **R1** | Free AI limits change or drop | Grading and generation stop | Provider seam with fallback provider, daily caps, request caching (`ai_cache`), and graceful `paused_cap` job queuing. |
| **R2** | Shared free key across users | One user consumes global quota | Per-user rate limiting (20 req/min) and daily usage sub-budgets tracked in `usage_counters`. |
| **R3** | AI invents resources or grades badly | Trust collapses | URLs must strictly come from search provider candidates; HTTP vetting and dead-link dropping; user overrides on all grades. |
| **R4** | iOS web push unreliable | Reminders missed | Honest note on iOS requiring home screen addition; email delivery fallback via Resend. |
| **R5** | Vercel cron minimum interval on plan | Reminders not minute-accurate | Sub-daily scheduling handled via Supabase `pg_cron` calling protected route with `CRON_SECRET`; daily fallback in `vercel.json`. |
| **R6** | Supabase free-tier pause | App unreachable after 7 days inactivity | Daily reminder and retention crons keep database active; upgrade decision point at 250MB database size. |
| **R7** | Scope creep into social/speech | Ship date slips | Strict non-goals list maintained: single-user first, multi-user ready, no audio grading in v0.1. |
| **R8** | Adapt engine feels punitive | User quits | "Compress first", MVD always available, neutral non-judgmental copy, user decides adaptation strategy. |
| **R9** | Materials contain copyrighted text | Legal exposure for quoting | Chunks indexed privately; tutor shows short citations and paraphrases; materials bucket protected by RLS and 5-min signed URLs. |
| **R10**| Skill graph quality varies by domain | Plans feel inaccurate | User-editable DAG with prerequisite cycle detection, domain templates, and adapt logs (`goal_changes`). |

### Open Decisions & Locked Defaults (PRD Section 16)
1. **Study Days:** Monday to Friday, ~96 minutes/day for an 8-hour weekly capacity.
2. **Applied Skill Verification:** User-confirmed override counts as E2. Skills marked `artifact` require E3 confirmation of expected output.
3. **First Real Run:** Data engineering is the primary live goal; Health analytics is a test fixture for the import path.

---

## Repository Documentation

- [Learnitt_PRD.md](Learnitt_PRD.md): Product requirements, data model, API routes, offline sync rules, and test plan.
- [Learnitt_Architecture.md](Learnitt_Architecture.md): System architecture, pressure tests, component library mapping, and core loop design.
- [Learnitt_PromptPack.md](Learnitt_PromptPack.md): Phased build plan (L0 to L13) mapped to milestones M0 to M11.
- [docs/runbooks/backups.md](docs/runbooks/backups.md): Backup execution, restoration testing, and Supabase free-tier maintenance.
- [linear design.md](linear%20design.md): Design tokens, colors, typography, and density guidelines.
- [CLAUDE.md](CLAUDE.md): Agent pairing guidelines, 10 system invariants, and copy rules.

---

## License

Private / Proprietary. All rights reserved.

