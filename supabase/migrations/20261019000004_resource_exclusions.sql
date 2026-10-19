-- Migration: 20261019000004_resource_exclusions.sql
-- Phase L10: Resource discovery and exclusions list (Epic B3 and B4)

CREATE TABLE IF NOT EXISTS resource_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, url)
);

-- RLS policies
ALTER TABLE resource_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own resource exclusions"
  ON resource_exclusions
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_resource_exclusions_goal_url
  ON resource_exclusions(goal_id, url);

CREATE INDEX IF NOT EXISTS idx_resource_exclusions_owner
  ON resource_exclusions(owner_id);
