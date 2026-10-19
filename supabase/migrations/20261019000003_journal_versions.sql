-- Migration: Additive columns for journal entry versioning and offline idempotency
-- PRD Section 8, Epic G1 & Phase L8 Requirement 5

ALTER TABLE public.journal_entries 
  ADD COLUMN IF NOT EXISTS entry_id uuid,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS client_id text;

-- Backfill entry_id to id for existing rows
UPDATE public.journal_entries 
SET entry_id = id 
WHERE entry_id IS NULL;

-- Set default for entry_id to gen_random_uuid()
ALTER TABLE public.journal_entries 
  ALTER COLUMN entry_id SET DEFAULT gen_random_uuid();

-- Create index for entry version lookups
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_id 
  ON public.journal_entries(entry_id, version DESC);

-- Create index for client_id lookups
CREATE INDEX IF NOT EXISTS idx_journal_entries_client_id 
  ON public.journal_entries(owner_id, client_id) 
  WHERE client_id IS NOT NULL;
