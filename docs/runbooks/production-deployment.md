# Learnitt Production Deployment Runbook (Phase L13)

This runbook guides the complete setup and deployment of Learnitt to **Vercel** and **Supabase** for the six-month production pilot.

---

## 1. Supabase Production Project Setup

### 1.1 Create Project
1. Log in to [Supabase](https://supabase.com) and create a new organization/project:
   - **Name**: `learnitt-production`
   - **Database Region**: Choose closest to your primary study location (e.g., `London (eu-west-2)`).
   - **Plan**: Free tier (upgrade to Pro if retention or pausing requires continuous uptime; see [backups.md](./backups.md)).

### 1.2 Run Database Migrations
Apply migrations in numerical sequence using the Supabase CLI or SQL Editor:
```bash
# Using Supabase CLI:
supabase link --project-ref <your-project-ref>
supabase db push

# Or run files in order via SQL Editor:
# 1. supabase/migrations/20261019000000_create_profiles.sql
# 2. supabase/migrations/20261019000001_full_schema_and_rls.sql
# 3. supabase/migrations/20261019000002_search_chunks_rpc.sql
# 4. supabase/migrations/20261019000003_journal_versions.sql
# 5. supabase/migrations/20261019000004_resource_exclusions.sql
# 6. supabase/migrations/20261019000005_pg_cron_reminders.sql
# 7. supabase/migrations/20261019000006_retention_cron.sql
```

### 1.3 Configure Storage Bucket
1. Go to **Storage** in the Supabase Dashboard.
2. Confirm the `materials` bucket exists and is marked **Private** (public access disabled).
3. Confirm RLS policies on `storage.objects` match [20261019000001_full_schema_and_rls.sql](../../supabase/migrations/20261019000001_full_schema_and_rls.sql) (users can only access objects matching their `(storage.foldername(name))[1] = auth.uid()::text`).

### 1.4 Auth Settings
1. Go to **Authentication** > **Providers** > **Email**:
   - Enable Email provider.
   - For a single-user pilot, you can disable public sign-ups after creating your account, or enable magic link auth.
2. Set **Site URL** and **Redirect URLs** to your production domain (e.g. `https://learnitt.vercel.app/auth/callback`).

---

## 2. External Provider Keys & Configuration

### 2.1 AI Provider (Gemini / OpenAI / Anthropic)
- Default: `AI_PROVIDER=gemini`, `AI_MODEL=gemini-2.5-flash`
- Get API key from Google AI Studio.
- Daily generation cap is enforced in code: `DAILY_AI_CALL_CAP=30`.

### 2.2 Search Provider (Tavily)
- `SEARCH_PROVIDER=tavily`
- Free tier: 1,000 queries/month.
- Daily search cap: 20 queries/day.

### 2.3 Email Delivery (Resend)
- Sign up at [Resend](https://resend.com) (free tier: 3,000 emails/month, 100/day).
- Add and verify your domain (e.g. `learnitt.app`), or use Resend onboarding sender for initial testing.
- Set `EMAIL_PROVIDER_KEY=re_...` and `EMAIL_FROM=Learnitt <study@yourdomain.com>`.

### 2.4 Web Push (VAPID)
Generate a VAPID keypair:
```bash
npx web-push generate-vapid-keys
```
Output:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: paste public key into Vercel and app.
- `VAPID_PRIVATE_KEY`: paste private key into secret environment variables.
- `VAPID_SUBJECT`: `mailto:operator@yourdomain.com`

---

## 3. Vercel Production Deployment

### 3.1 Connect Repository & Build Settings
1. Import repository into [Vercel](https://vercel.com).
2. Framework Preset: **Next.js**
3. Build Command: `pnpm run build` (runs next build, bundle secret scan, and 180 KB budget check).
4. Output Directory: `.next`

### 3.2 Environment Variables in Vercel
Add the following in **Project Settings** > **Environment Variables** (Production):

| Variable | Description | Example / Required |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xyzcompany.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | `eyJhbG...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret service role key (backend only) | `eyJhbG...` (NEVER public) |
| `MOCK_MODE` | Set to false in production | `false` |
| `AI_PROVIDER` | AI provider | `gemini` |
| `AI_MODEL` | AI model | `gemini-2.5-flash` |
| `AI_PROVIDER_KEY` | AI API Key | `AIza...` |
| `DAILY_AI_CALL_CAP` | System-wide daily AI cap | `30` |
| `DAILY_USER_AI_CALL_CAP` | Per-user daily AI cap | `25` |
| `SEARCH_PROVIDER` | Search provider | `tavily` |
| `SEARCH_PROVIDER_KEY` | Tavily API Key | `tvly-...` |
| `EMAIL_PROVIDER_KEY` | Resend API Key | `re_...` |
| `EMAIL_FROM` | Verified sender email | `Learnitt <study@learnitt.app>` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key | `BN4y...` |
| `VAPID_PRIVATE_KEY` | VAPID private key | `...` |
| `VAPID_SUBJECT` | Contact URI | `mailto:pilot@learnitt.com` |
| `CRON_SECRET` | Secret token authorizing cron calls | Generate 32+ char hex random |

---

## 4. Production Cron Schedules

Vercel Hobby plan allows daily cron schedules (`vercel.json`).
Two production cron jobs are configured:
1. **Daily Reminders**: `0 8 * * *` (08:00 UTC) calling `/api/v1/cron/reminders`.
2. **Daily Retention Purge**: `0 3 * * *` (03:00 UTC) calling `/api/v1/cron/retention`.

Both endpoints strictly enforce the header:
`x-cron-secret: $CRON_SECRET` (or `Authorization: Bearer $CRON_SECRET`).
Vercel automatically passes `CRON_SECRET` if configured in project settings.

---

## 5. Pilot Account Initialization

In production, **no fake seed data** is created. The operator account is initialized cleanly:
1. Sign in via `/login` to create the authenticated user.
2. Complete the onboarding wizard or use `/api/v1/goals` to create the real 6-month Data Engineering goal:
   - **Title**: `Junior Data Engineer in 6 months`
   - **Weekly Hours**: `8.0`
   - **Study Days**: `Monday to Friday` (1, 2, 3, 4, 5)
   - **Target Date**: Today + 180 days
   - **Starting Level**: `beginner`
3. Generate the 12-skill graph via the app or import.
4. Verify `/today` generates today's primary plan item and MVD tasks.
5. Track six-month pilot health and targets at `/metrics`.
