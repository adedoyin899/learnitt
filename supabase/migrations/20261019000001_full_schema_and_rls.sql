-- Migration: 20261019000001_full_schema_and_rls.sql
-- Description: Complete Learnitt database schema, RLS policies, views, and storage bucket configuration

-- 1. Profiles (ensure exists)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/London',
  ai_materials_consent boolean not null default false,
  ai_consent_asked_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2. Goals
create table if not exists public.goals (
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
create unique index if not exists one_active_goal_per_owner on public.goals(owner_id) where status = 'active';

-- 3. Skills
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
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

-- 4. Skill Prerequisites (DAG)
create table if not exists public.skill_prereqs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  prereq_id uuid not null references public.skills(id) on delete cascade,
  primary key (skill_id, prereq_id),
  check (skill_id <> prereq_id)
);

-- 5. Materials (Private uploads & links)
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  kind text not null check (kind in ('pdf','text','markdown','docx','url','plan_import')),
  title text not null,
  storage_path text,
  source_url text,
  byte_size bigint,
  content_hash text,
  status text not null default 'pending' check (status in ('pending','ready','needs_attention')),
  status_reason text,
  created_at timestamptz not null default now()
);

-- 6. Material Chunks for Retrieval
create table if not exists public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  ordinal int not null,
  content text not null,
  tokens int not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored
);
create index if not exists material_chunks_fts on public.material_chunks using gin(fts);

-- 7. Skill-to-Material Links
create table if not exists public.skill_material_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  confirmed boolean not null default false,
  primary key (skill_id, material_id)
);

-- 8. Resources (Vetted & Approved)
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null,
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

-- 9. Plan Items
create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete cascade,
  scheduled_date date not null,
  kind text not null check (kind in ('learn','practise','apply','review','quiz')),
  planned_minutes int not null check (planned_minutes between 5 and 120),
  material_id uuid references public.materials(id) on delete set null,
  resource_id uuid references public.resources(id) on delete set null,
  mvd_minutes int not null,
  status text not null default 'planned' check (status in ('planned','rescheduled','unscheduled','done','partial','missed','mvd_only')),
  plan_version int not null default 1,
  rescheduled_from date,
  position int not null default 0
);
create index if not exists plan_items_owner_date on public.plan_items(owner_id, scheduled_date);

-- 10. Check-ins
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_item_id uuid not null references public.plan_items(id) on delete cascade,
  outcome text not null check (outcome in ('done','partial','missed','mvd_only')),
  minutes_actual int check (minutes_actual between 0 and 480),
  reason text check (reason in ('no_time','unwell','client_work','too_hard','too_easy','other')),
  note text,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, client_id)
);

-- 11. Quizzes
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  prompt_version text not null,
  model_version text,
  created_at timestamptz not null default now()
);

-- 12. Quiz Questions
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position int not null,
  type text not null check (type in ('recall_mc','recall_tf','applied','artifact')),
  prompt text not null,
  options jsonb,
  answer_key jsonb,
  rubric jsonb,
  source_chunk_ids uuid[] not null default '{}'
);

-- 13. Attempts
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_text text,
  answer_file_path text,
  status text not null default 'submitted' check (status in ('submitted','pending_grade','graded','needs_your_review')),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, client_id)
);

-- 14. Grades
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
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

-- 15. Conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 16. Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  cited_chunk_ids uuid[] not null default '{}',
  general_knowledge boolean not null default false,
  created_at timestamptz not null default now()
);

-- 17. Journal Entries
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  mood smallint check (mood between 1 and 5),
  linked_check_in_id uuid references public.check_ins(id) on delete set null,
  linked_skill_id uuid references public.skills(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 18. Skill Reviews (Spaced Repetition)
create table if not exists public.skill_reviews (
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  interval_days smallint not null default 1,
  due_on date not null,
  last_result text check (last_result in ('pass','fail')),
  primary key (skill_id)
);

-- 19. Goal Changes (Adapt Log)
create table if not exists public.goal_changes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  change_type text not null check (change_type in ('compress','extend','add_time','reduce_scope','graph_edit','import')),
  detail jsonb not null,
  created_at timestamptz not null default now()
);

-- 20. AI Jobs (Queue)
create table if not exists public.ai_jobs (
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
create index if not exists ai_jobs_queue on public.ai_jobs(status, run_after);

-- 21. AI Cache
create table if not exists public.ai_cache (
  cache_key text primary key,
  task text not null,
  provider text not null,
  prompt_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- 22. Usage Counters
create table if not exists public.usage_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (owner_id, day)
);

-- 23. Reminder Settings
create table if not exists public.reminder_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  daily_time time,
  weekdays smallint[] not null default '{1,2,3,4,5}',
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  weekly_review_day smallint default 0
);

-- 24. Push Subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- 25. Audit Events
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- 26. Reminder Log (Milestone requirement)
create table if not exists public.reminder_log (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  day date not null,
  created_at timestamptz not null default now(),
  unique (owner_id, kind, day)
);

-- 27. Saved Cards (Milestone requirement for flashcards)
create table if not exists public.saved_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on every table
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.skills enable row level security;
alter table public.skill_prereqs enable row level security;
alter table public.materials enable row level security;
alter table public.material_chunks enable row level security;
alter table public.skill_material_links enable row level security;
alter table public.resources enable row level security;
alter table public.plan_items enable row level security;
alter table public.check_ins enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.attempts enable row level security;
alter table public.grades enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.journal_entries enable row level security;
alter table public.skill_reviews enable row level security;
alter table public.goal_changes enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_events enable row level security;
alter table public.reminder_log enable row level security;
alter table public.saved_cards enable row level security;

-- Server-only tables: RLS enabled, NO direct client access policies
alter table public.ai_jobs enable row level security;
alter table public.ai_cache enable row level security;
alter table public.usage_counters enable row level security;

-- Helper macro/policies: owner_id = auth.uid()
-- Goals
create policy "goals_owner_select" on public.goals for select using (owner_id = auth.uid());
create policy "goals_owner_insert" on public.goals for insert with check (owner_id = auth.uid());
create policy "goals_owner_update" on public.goals for update using (owner_id = auth.uid());
create policy "goals_owner_delete" on public.goals for delete using (owner_id = auth.uid());

-- Skills
create policy "skills_owner_select" on public.skills for select using (owner_id = auth.uid());
create policy "skills_owner_insert" on public.skills for insert with check (owner_id = auth.uid());
create policy "skills_owner_update" on public.skills for update using (owner_id = auth.uid());
create policy "skills_owner_delete" on public.skills for delete using (owner_id = auth.uid());

-- Skill Prereqs
create policy "skill_prereqs_owner_select" on public.skill_prereqs for select using (owner_id = auth.uid());
create policy "skill_prereqs_owner_insert" on public.skill_prereqs for insert with check (owner_id = auth.uid());
create policy "skill_prereqs_owner_update" on public.skill_prereqs for update using (owner_id = auth.uid());
create policy "skill_prereqs_owner_delete" on public.skill_prereqs for delete using (owner_id = auth.uid());

-- Materials
create policy "materials_owner_select" on public.materials for select using (owner_id = auth.uid());
create policy "materials_owner_insert" on public.materials for insert with check (owner_id = auth.uid());
create policy "materials_owner_update" on public.materials for update using (owner_id = auth.uid());
create policy "materials_owner_delete" on public.materials for delete using (owner_id = auth.uid());

-- Material Chunks
create policy "chunks_owner_select" on public.material_chunks for select using (owner_id = auth.uid());
create policy "chunks_owner_insert" on public.material_chunks for insert with check (owner_id = auth.uid());
create policy "chunks_owner_update" on public.material_chunks for update using (owner_id = auth.uid());
create policy "chunks_owner_delete" on public.material_chunks for delete using (owner_id = auth.uid());

-- Skill Material Links
create policy "links_owner_select" on public.skill_material_links for select using (owner_id = auth.uid());
create policy "links_owner_insert" on public.skill_material_links for insert with check (owner_id = auth.uid());
create policy "links_owner_update" on public.skill_material_links for update using (owner_id = auth.uid());
create policy "links_owner_delete" on public.skill_material_links for delete using (owner_id = auth.uid());

-- Resources
create policy "resources_owner_select" on public.resources for select using (owner_id = auth.uid());
create policy "resources_owner_insert" on public.resources for insert with check (owner_id = auth.uid());
create policy "resources_owner_update" on public.resources for update using (owner_id = auth.uid());
create policy "resources_owner_delete" on public.resources for delete using (owner_id = auth.uid());

-- Plan Items
create policy "plan_items_owner_select" on public.plan_items for select using (owner_id = auth.uid());
create policy "plan_items_owner_insert" on public.plan_items for insert with check (owner_id = auth.uid());
create policy "plan_items_owner_update" on public.plan_items for update using (owner_id = auth.uid());
create policy "plan_items_owner_delete" on public.plan_items for delete using (owner_id = auth.uid());

-- Check-ins
create policy "check_ins_owner_select" on public.check_ins for select using (owner_id = auth.uid());
create policy "check_ins_owner_insert" on public.check_ins for insert with check (owner_id = auth.uid());
create policy "check_ins_owner_update" on public.check_ins for update using (owner_id = auth.uid());
create policy "check_ins_owner_delete" on public.check_ins for delete using (owner_id = auth.uid());

-- Quizzes
create policy "quizzes_owner_select" on public.quizzes for select using (owner_id = auth.uid());
create policy "quizzes_owner_insert" on public.quizzes for insert with check (owner_id = auth.uid());
create policy "quizzes_owner_update" on public.quizzes for update using (owner_id = auth.uid());
create policy "quizzes_owner_delete" on public.quizzes for delete using (owner_id = auth.uid());

-- Quiz Questions
create policy "quiz_questions_owner_select" on public.quiz_questions for select using (owner_id = auth.uid());
create policy "quiz_questions_owner_insert" on public.quiz_questions for insert with check (owner_id = auth.uid());
create policy "quiz_questions_owner_update" on public.quiz_questions for update using (owner_id = auth.uid());
create policy "quiz_questions_owner_delete" on public.quiz_questions for delete using (owner_id = auth.uid());

-- Attempts
create policy "attempts_owner_select" on public.attempts for select using (owner_id = auth.uid());
create policy "attempts_owner_insert" on public.attempts for insert with check (owner_id = auth.uid());
create policy "attempts_owner_update" on public.attempts for update using (owner_id = auth.uid());
create policy "attempts_owner_delete" on public.attempts for delete using (owner_id = auth.uid());

-- Grades
create policy "grades_owner_select" on public.grades for select using (owner_id = auth.uid());
create policy "grades_owner_insert" on public.grades for insert with check (owner_id = auth.uid());
create policy "grades_owner_update" on public.grades for update using (owner_id = auth.uid());
create policy "grades_owner_delete" on public.grades for delete using (owner_id = auth.uid());

-- Conversations
create policy "conversations_owner_select" on public.conversations for select using (owner_id = auth.uid());
create policy "conversations_owner_insert" on public.conversations for insert with check (owner_id = auth.uid());
create policy "conversations_owner_update" on public.conversations for update using (owner_id = auth.uid());
create policy "conversations_owner_delete" on public.conversations for delete using (owner_id = auth.uid());

-- Messages
create policy "messages_owner_select" on public.messages for select using (owner_id = auth.uid());
create policy "messages_owner_insert" on public.messages for insert with check (owner_id = auth.uid());
create policy "messages_owner_update" on public.messages for update using (owner_id = auth.uid());
create policy "messages_owner_delete" on public.messages for delete using (owner_id = auth.uid());

-- Journal Entries
create policy "journal_owner_select" on public.journal_entries for select using (owner_id = auth.uid());
create policy "journal_owner_insert" on public.journal_entries for insert with check (owner_id = auth.uid());
create policy "journal_owner_update" on public.journal_entries for update using (owner_id = auth.uid());
create policy "journal_owner_delete" on public.journal_entries for delete using (owner_id = auth.uid());

-- Skill Reviews
create policy "reviews_owner_select" on public.skill_reviews for select using (owner_id = auth.uid());
create policy "reviews_owner_insert" on public.skill_reviews for insert with check (owner_id = auth.uid());
create policy "reviews_owner_update" on public.skill_reviews for update using (owner_id = auth.uid());
create policy "reviews_owner_delete" on public.skill_reviews for delete using (owner_id = auth.uid());

-- Goal Changes
create policy "changes_owner_select" on public.goal_changes for select using (owner_id = auth.uid());
create policy "changes_owner_insert" on public.goal_changes for insert with check (owner_id = auth.uid());
create policy "changes_owner_update" on public.goal_changes for update using (owner_id = auth.uid());
create policy "changes_owner_delete" on public.goal_changes for delete using (owner_id = auth.uid());

-- Reminder Settings
create policy "reminder_settings_owner_select" on public.reminder_settings for select using (owner_id = auth.uid());
create policy "reminder_settings_owner_insert" on public.reminder_settings for insert with check (owner_id = auth.uid());
create policy "reminder_settings_owner_update" on public.reminder_settings for update using (owner_id = auth.uid());
create policy "reminder_settings_owner_delete" on public.reminder_settings for delete using (owner_id = auth.uid());

-- Push Subscriptions
create policy "push_subs_owner_select" on public.push_subscriptions for select using (owner_id = auth.uid());
create policy "push_subs_owner_insert" on public.push_subscriptions for insert with check (owner_id = auth.uid());
create policy "push_subs_owner_update" on public.push_subscriptions for update using (owner_id = auth.uid());
create policy "push_subs_owner_delete" on public.push_subscriptions for delete using (owner_id = auth.uid());

-- Audit Events
create policy "audit_events_owner_select" on public.audit_events for select using (owner_id = auth.uid());
create policy "audit_events_owner_insert" on public.audit_events for insert with check (owner_id = auth.uid());

-- Reminder Log
create policy "reminder_log_owner_select" on public.reminder_log for select using (owner_id = auth.uid());
create policy "reminder_log_owner_insert" on public.reminder_log for insert with check (owner_id = auth.uid());

-- Saved Cards
create policy "saved_cards_owner_select" on public.saved_cards for select using (owner_id = auth.uid());
create policy "saved_cards_owner_insert" on public.saved_cards for insert with check (owner_id = auth.uid());
create policy "saved_cards_owner_update" on public.saved_cards for update using (owner_id = auth.uid());
create policy "saved_cards_owner_delete" on public.saved_cards for delete using (owner_id = auth.uid());

-- ============================================================================
-- SECURE CLIENT VIEWS & RPCs
-- ============================================================================

-- Client view to safely inspect usage_counters for the authenticated user only
create or replace view public.my_usage_counters with (security_invoker = true) as
  select day, calls, tokens_in, tokens_out
  from public.usage_counters
  where owner_id = auth.uid();

-- RPC for client to query their own usage counter for today
create or replace function public.get_my_usage_today()
returns table (
  day date,
  calls int,
  tokens_in bigint,
  tokens_out bigint
) language sql security definer set search_path = public as $$
  select day, calls, tokens_in, tokens_out
  from public.usage_counters
  where owner_id = auth.uid() and day = current_date;
$$;

-- ============================================================================
-- STORAGE CONFIGURATION
-- ============================================================================

-- Ensure storage schema and private materials bucket exists
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do update set public = false;

-- Storage RLS: Owner prefix policy ({owner_id}/{material_id}/{filename})
create policy "materials_bucket_owner_select"
  on storage.objects for select
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "materials_bucket_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "materials_bucket_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "materials_bucket_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
