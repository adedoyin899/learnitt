-- Migration: 20261019000002_search_chunks_rpc.sql
-- Description: Full-text search retrieval function for material chunks (PRD Epic B1 AC3)

create or replace function public.search_material_chunks(
  p_owner_id uuid,
  p_query text,
  p_goal_id uuid default null,
  p_limit int default 5
)
returns table (
  id uuid,
  material_id uuid,
  material_title text,
  ordinal int,
  content text,
  tokens int,
  rank real
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.material_id,
    m.title as material_title,
    c.ordinal,
    c.content,
    c.tokens,
    ts_rank(c.fts, plainto_tsquery('english', p_query)) as rank
  from public.material_chunks c
  join public.materials m on m.id = c.material_id
  where c.owner_id = p_owner_id
    and (p_goal_id is null or m.goal_id = p_goal_id)
    and c.fts @@ plainto_tsquery('english', p_query)
  order by rank desc
  limit p_limit;
$$;
