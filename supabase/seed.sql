-- Seed: supabase/seed.sql
-- Description: Idempotent seed script with two test users and domain-agnostic fixtures

-- 1. Create Test Users in auth.users
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'maz@learnitt.com',
    '$2a$10$abcdefghijklmnopqrstuvwxyzABCDE',
    now(),
    '{"full_name": "Maz", "display_name": "Maz"}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alex@learnitt.com',
    '$2a$10$abcdefghijklmnopqrstuvwxyzABCDE',
    now(),
    '{"full_name": "Alex", "display_name": "Alex"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

-- 2. Profiles for Test Users
insert into public.profiles (id, display_name, timezone, ai_materials_consent)
values
  ('11111111-1111-1111-1111-111111111111', 'Maz', 'Europe/London', true),
  ('22222222-2222-2222-2222-222222222222', 'Alex', 'America/New_York', true)
on conflict (id) do update set
  display_name = excluded.display_name,
  timezone = excluded.timezone;

-- 3. User A: Primary Active Goal (Junior Data Engineer)
insert into public.goals (
  id,
  owner_id,
  title,
  domain,
  starting_level,
  target_date,
  weekly_hours,
  study_days,
  status,
  health_flag
)
values (
  'a1111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Junior Data Engineer in 6 months',
  'Data Engineering',
  'beginner',
  current_date + interval '180 days',
  8.0,
  '{1,2,3,4,5}',
  'active',
  false
)
on conflict (id) do nothing;

-- 4. User A: 12-Skill Data Engineering Graph (DAG)
insert into public.skills (
  id, owner_id, goal_id, name, description, estimated_min_minutes, estimated_max_minutes,
  difficulty, priority, verification_type, mvd_minutes, mvd_task, status, evidence_level, position
)
values
  ('b1111111-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'SQL Fundamentals', 'Core queries with SELECT, WHERE, and aggregations.', 60, 120, 1, 1, 'recall', 15, 'Run 3 queries filtering with WHERE.', 'verified', 1, 1),

  ('b1111111-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'SQL Joins and Window Functions', 'INNER, LEFT joins, and row_number/rank windows.', 90, 180, 2, 1, 'applied', 15, 'Write 1 multi-table join query.', 'learning', 0, 2),

  ('b1111111-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Python Fundamentals', 'Variables, control flow, functions, and data structures.', 60, 120, 1, 1, 'recall', 15, 'Write 2 pure Python functions with tests.', 'not_started', 0, 3),

  ('b1111111-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Python for Data & Pandas', 'Tabular data transformation, cleaning, and filtering.', 90, 180, 2, 2, 'applied', 15, 'Clean one dirty CSV using Pandas.', 'not_started', 0, 4),

  ('b1111111-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Relational Data Modelling', 'Entity relationships, primary keys, and normal forms.', 90, 150, 2, 2, 'applied', 15, 'Sketch an ER diagram for 3 related tables.', 'not_started', 0, 5),

  ('b1111111-0006-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Dimensional Modelling & Star Schemas', 'Facts, dimensions, surrogate keys, and slowly changing dimensions.', 120, 240, 3, 1, 'applied', 20, 'Design one fact and two dimension schemas.', 'not_started', 0, 6),

  ('b1111111-0007-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Batch ETL Pipeline Development', 'Extracting source data, transforming, and loading into targets.', 120, 240, 3, 1, 'artifact', 20, 'Write a script loading data from API to DB.', 'not_started', 0, 7),

  ('b1111111-0008-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Pipeline Orchestration with Airflow', 'Writing DAGs, tasks, operators, and managing schedules.', 120, 240, 3, 2, 'artifact', 20, 'Write a basic 3-task Airflow DAG.', 'not_started', 0, 8),

  ('b1111111-0009-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Cloud Object Storage & Data Lakes', 'S3/GCS buckets, partitioning strategies, and parquet formats.', 90, 150, 2, 2, 'recall', 15, 'Explain partitioning by year/month/day.', 'not_started', 0, 9),

  ('b1111111-0010-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Cloud Data Warehousing', 'Snowflake / BigQuery principles, clustering, and querying.', 120, 240, 3, 1, 'applied', 20, 'Query a partitioned public warehouse dataset.', 'not_started', 0, 10),

  ('b1111111-0011-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Data Quality & Automated Testing', 'Schema validation, null checks, and Great Expectations/dbt tests.', 90, 180, 2, 2, 'applied', 15, 'Write 2 assertion tests for pipeline output.', 'not_started', 0, 11),

  ('b1111111-0012-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'Capstone Data Engineering Project', 'End-to-end automated pipeline from ingestion to warehouse.', 240, 480, 4, 1, 'artifact', 30, 'Document repo architecture and run test run.', 'not_started', 0, 12)
on conflict (id) do nothing;

-- 5. User A: Prerequisites for Data Engineering Graph
insert into public.skill_prereqs (owner_id, skill_id, prereq_id)
values
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0002-0000-0000-000000000002', 'b1111111-0001-0000-0000-000000000001'), -- sql_adv needs sql_basics
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0004-0000-0000-000000000004', 'b1111111-0003-0000-0000-000000000003'), -- py_data needs py_basics
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0005-0000-0000-000000000005', 'b1111111-0001-0000-0000-000000000001'), -- modelling needs sql_basics
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0006-0000-0000-000000000006', 'b1111111-0005-0000-0000-000000000005'), -- star_schema needs modelling
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0007-0000-0000-000000000007', 'b1111111-0002-0000-0000-000000000002'), -- batch needs sql_adv
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0007-0000-0000-000000000007', 'b1111111-0004-0000-0000-000000000004'), -- batch needs py_data
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0008-0000-0000-000000000008', 'b1111111-0007-0000-0000-000000000007'), -- airflow needs batch
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0009-0000-0000-000000000009', 'b1111111-0007-0000-0000-000000000007'), -- cloud_lake needs batch
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0010-0000-0000-000000000010', 'b1111111-0006-0000-0000-000000000006'), -- warehouse needs star_schema
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0010-0000-0000-000000000010', 'b1111111-0009-0000-0000-000000000009'), -- warehouse needs cloud_lake
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0011-0000-0000-000000000011', 'b1111111-0007-0000-0000-000000000007'), -- testing needs batch
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0012-0000-0000-000000000012', 'b1111111-0008-0000-0000-000000000008'), -- capstone needs airflow
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0012-0000-0000-000000000012', 'b1111111-0010-0000-0000-000000000010'), -- capstone needs warehouse
  ('11111111-1111-1111-1111-111111111111', 'b1111111-0012-0000-0000-000000000012', 'b1111111-0011-0000-0000-000000000011')  -- capstone needs testing
on conflict do nothing;

-- 6. User A: Second Seeded Goal from a Non-Technical Domain (Language)
-- Status is 'draft' to demonstrate domain agnosticism while respecting one_active_goal_per_owner
insert into public.goals (
  id,
  owner_id,
  title,
  domain,
  starting_level,
  target_date,
  weekly_hours,
  study_days,
  status,
  health_flag
)
values (
  'a2222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Conversational Spanish in 3 months',
  'Language',
  'beginner',
  current_date + interval '90 days',
  5.0,
  '{1,2,3,4,5}',
  'draft',
  false
)
on conflict (id) do nothing;

insert into public.skills (
  id, owner_id, goal_id, name, description, estimated_min_minutes, estimated_max_minutes,
  difficulty, priority, verification_type, mvd_minutes, mvd_task, status, evidence_level, position
)
values
  ('c1111111-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
   'Spanish Phonetics & Pronunciation', 'Vowel sounds, rolled r, and stress patterns.', 45, 90, 1, 1, 'recall', 15, 'Read 10 words aloud focusing on pure vowels.', 'not_started', 0, 1),

  ('c1111111-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
   'Common Greetings & Introductions', 'Meeting people, greetings, numbers 1-100.', 60, 120, 1, 1, 'recall', 15, 'Introduce yourself in 3 spoken sentences.', 'not_started', 0, 2),

  ('c1111111-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
   'Present Tense Regular Verbs', 'Conjugating -ar, -er, and -ir verbs in present indicative.', 90, 150, 2, 1, 'applied', 15, 'Conjugate hablar, comer, and vivir.', 'not_started', 0, 3),

  ('c1111111-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
   '10-Minute Sustained Conversation', 'Hold an unbroken conversation with native audio or exchange.', 120, 240, 3, 1, 'self', 20, 'Record a 2-minute spoken response.', 'not_started', 0, 4)
on conflict (id) do nothing;

insert into public.skill_prereqs (owner_id, skill_id, prereq_id)
values
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0002-0000-0000-000000000002', 'c1111111-0001-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0003-0000-0000-000000000003', 'c1111111-0002-0000-0000-000000000002'),
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0004-0000-0000-000000000004', 'c1111111-0003-0000-0000-000000000003')
on conflict do nothing;

-- 7. User B: Active Goal (Tenant Isolation Test Fixture)
insert into public.goals (
  id,
  owner_id,
  title,
  domain,
  starting_level,
  target_date,
  weekly_hours,
  study_days,
  status,
  health_flag
)
values (
  'b2222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  'Health Analytics and Biostatistics',
  'Health Analytics',
  'intermediate',
  current_date + interval '120 days',
  10.0,
  '{1,2,3,4,5}',
  'active',
  true
)
on conflict (id) do nothing;
