create or replace function public.match_project_passages(
  target_project_id uuid,
  query_embedding extensions.vector(768),
  max_clearance smallint default 1,
  result_limit integer default 8
)
returns table (
  passage_id uuid,
  source_id uuid,
  source_title text,
  source_url text,
  occurred_at timestamptz,
  passage_content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.source_id, s.title, s.url, s.occurred_at, p.content,
         1 - (p.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.source_passages as p
  join public.sources as s on s.id = p.source_id and s.project_id = p.project_id
  where p.project_id = target_project_id
    and p.embedding is not null
    and greatest(p.clearance, s.clearance) <= least(greatest(max_clearance, 1), 3)
  order by p.embedding OPERATOR(extensions.<=>) query_embedding, p.id
  limit least(greatest(result_limit, 1), 12);
$$;

revoke all on function public.match_project_passages(uuid, extensions.vector, smallint, integer) from public, anon;
grant execute on function public.match_project_passages(uuid, extensions.vector, smallint, integer) to authenticated;
