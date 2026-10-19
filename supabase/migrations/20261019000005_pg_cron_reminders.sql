-- Migration: 20261019000005_pg_cron_reminders.sql
-- Phase L11: Supabase pg_cron scheduling for Learnitt reminders & check-ins (Epic H & PRD Section 11)
-- Enables minute-level scheduling bypassing Vercel Hobby plan 1-per-day restriction.

-- 1. Enable required extensions if permitted in the environment (e.g. Supabase production/dev)
do $$
begin
  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';
exception
  when others then
    null;
end $$;

-- 2. Clean up previous cron job if exists
do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-due-reminders') then
    perform cron.unschedule('process-due-reminders');
  end if;
exception
  when others then null;
end $$;

-- 3. Schedule cron job calling protected route every minute
-- In production, the URL and CRON_SECRET are populated from Supabase Vault / app settings.
do $$
begin
  perform cron.schedule(
    'process-due-reminders',
    '* * * * *',
    $cron$
    select net.http_post(
      url := coalesce(current_setting('app.settings.app_url', true), 'https://learnitt.app') || '/api/v1/cron/reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(current_setting('app.settings.cron_secret', true), 'mock-cron-secret')
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
exception
  when others then
    null;
end $$;
