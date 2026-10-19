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

## Repository Documentation

- [Learnitt_PRD.md](Learnitt_PRD.md): Product requirements, data model, API routes, offline sync rules, and test plan.
- [Learnitt_Architecture.md](Learnitt_Architecture.md): System architecture, pressure tests, component library mapping, and core loop design.
- [Learnitt_PromptPack.md](Learnitt_PromptPack.md): Phased build plan (L0 to L13) mapped to milestones M0 to M11.
- [linear design.md](linear%20design.md): Design tokens, colors, typography, and density guidelines.
- [CLAUDE.md](CLAUDE.md): Agent pairing guidelines, 10 system invariants, and copy rules.

---

## License

Private / Proprietary. All rights reserved.
