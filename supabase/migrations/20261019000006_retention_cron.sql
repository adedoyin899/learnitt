-- Migration: 20261019000006_retention_cron.sql
-- Phase L12: Retention Job (Epic I & PRD Section 14)
-- Purges ai_cache and ai_jobs older than 30 days, keeps usage counters 13 months.

-- 1. Create SQL retention function for direct database execution
create or replace function public.purge_expired_retention_data()
returns table (
  purged_cache_count bigint,
  purged_jobs_count bigint,
  purged_counters_count bigint
) language plpgsql security definer as $$
declare
  v_cache bigint;
  v_jobs bigint;
  v_counters bigint;
begin
  -- Purge AI cache older than 30 days
  with deleted_cache as (
    delete from public.ai_cache
    where created_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_cache from deleted_cache;

  -- Purge completed/failed AI jobs older than 30 days
  with deleted_jobs as (
    delete from public.ai_jobs
    where created_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_jobs from deleted_jobs;

  -- Purge usage counters older than 13 months
  with deleted_counters as (
    delete from public.usage_counters
    where day < current_date - interval '13 months'
    returning 1
  )
  select count(*) into v_counters from deleted_counters;

  return query select v_cache, v_jobs, v_counters;
end;
$$;

-- 2. Clean up previous retention cron job if exists
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-retention-purge') then
    perform cron.unschedule('daily-retention-purge');
  end if;
exception
  when others then null;
end $$;

-- 3. Schedule daily retention cron job at 03:00 UTC
do $$
begin
  perform cron.schedule(
    'daily-retention-purge',
    '0 3 * * *',
    'select * from public.purge_expired_retention_data();'
  );
exception
  when others then
    null;
end $$;
