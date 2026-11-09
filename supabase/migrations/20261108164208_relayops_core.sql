create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.project_role as enum ('lead', 'reviewer', 'contributor');
create type public.claim_status as enum ('needs_review', 'verified', 'conflict', 'missing_evidence', 'rejected');
create type public.review_disposition as enum ('pending', 'confirmed', 'resolved', 'accepted_uncertainty', 'rejected');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  is_demo boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  mutation_token uuid,
  mutation_heartbeat_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.project_role not null default 'contributor',
  clearance smallint not null default 1 check (clearance between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null check (provider in ('github', 'document', 'task', 'manual')),
  external_id text not null,
  title text not null,
  url text,
  author text,
  occurred_at timestamptz,
  clearance smallint not null default 1 check (clearance between 1 and 3),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (project_id, provider, external_id),
  unique (id, project_id)
);

create table public.source_passages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  passage_index integer not null check (passage_index >= 0),
  content text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  clearance smallint not null default 1 check (clearance between 1 and 3),
  embedding extensions.vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  unique (source_id, passage_index),
  unique (id, project_id),
  foreign key (source_id, project_id) references public.sources(id, project_id) on delete cascade
);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  canonical_name text not null,
  entity_type text not null,
  clearance smallint not null default 1 check (clearance between 1 and 3),
  created_at timestamptz not null default now(),
  unique (project_id, canonical_name, entity_type),
  unique (id, project_id)
);

create table public.entity_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_entity_id uuid not null,
  to_entity_id uuid not null,
  relation text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  source_passage_id uuid not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  clearance smallint not null default 1 check (clearance between 1 and 3),
  check (from_entity_id <> to_entity_id),
  check (valid_to is null or valid_to > valid_from),
  foreign key (from_entity_id, project_id) references public.entities(id, project_id) on delete cascade,
  foreign key (to_entity_id, project_id) references public.entities(id, project_id) on delete cascade,
  foreign key (source_passage_id, project_id) references public.source_passages(id, project_id) on delete cascade
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  category text not null check (category in ('decision', 'ownership', 'blocker', 'risk', 'next-action')),
  statement text not null,
  owner_name text,
  due_at timestamptz,
  status public.claim_status not null default 'needs_review',
  confidence numeric(4,3) check (confidence between 0 and 1),
  clearance smallint not null default 1 check (clearance between 1 and 3),
  extraction_run_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  claim_id uuid not null,
  passage_id uuid not null,
  quote text not null,
  start_offset integer,
  end_offset integer,
  relation text not null default 'supports' check (relation in ('supports', 'contradicts', 'context')),
  created_at timestamptz not null default now(),
  foreign key (claim_id, project_id) references public.claims(id, project_id) on delete cascade,
  foreign key (passage_id, project_id) references public.source_passages(id, project_id) on delete cascade,
  check ((start_offset is null and end_offset is null) or (start_offset >= 0 and end_offset > start_offset))
);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  claim_id uuid not null,
  user_id uuid not null references auth.users(id),
  decision public.review_disposition not null,
  note text not null default '',
  edited_statement text,
  claim_version integer not null check (claim_version > 0),
  created_at timestamptz not null default now(),
  foreign key (claim_id, project_id) references public.claims(id, project_id) on delete cascade
);

create table public.approved_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  approved_by uuid not null references auth.users(id),
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  unique (id, project_id)
);

create table public.receipt_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_id uuid not null,
  acknowledged_by uuid not null references auth.users(id),
  acknowledged_at timestamptz not null default now(),
  unique (snapshot_id, acknowledged_by),
  foreign key (snapshot_id, project_id) references public.approved_snapshots(id, project_id) on delete cascade
);

create function public.enforce_project_mutation_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_project_id uuid;
  current_mutation_token uuid;
  request_headers jsonb;
  request_mutation_token text;
begin
  target_project_id := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  request_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  request_mutation_token := request_headers ->> 'x-relayops-mutation-token';

  select p.mutation_token into current_mutation_token
  from public.projects p where p.id = target_project_id for share;

  if request_mutation_token is distinct from current_mutation_token::text then
    raise exception using errcode = '55P03', message = 'Project update lock does not match this write.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger sources_require_project_mutation_token
before insert or update or delete on public.sources
for each row execute function public.enforce_project_mutation_fence();
create trigger source_passages_require_project_mutation_token
before insert or update or delete on public.source_passages
for each row execute function public.enforce_project_mutation_fence();
create trigger claims_require_project_mutation_token
before insert or update or delete on public.claims
for each row execute function public.enforce_project_mutation_fence();
create trigger citations_require_project_mutation_token
before insert or update or delete on public.citations
for each row execute function public.enforce_project_mutation_fence();
create trigger entities_require_project_mutation_token
before insert or update or delete on public.entities
for each row execute function public.enforce_project_mutation_fence();
create trigger entity_edges_require_project_mutation_token
before insert or update or delete on public.entity_edges
for each row execute function public.enforce_project_mutation_fence();

create function public.record_review_decision(
  target_project_id uuid,
  target_claim_id uuid,
  actor_id uuid,
  expected_version integer,
  target_decision public.review_disposition,
  target_edited_statement text default null,
  target_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_role public.project_role;
  actor_clearance smallint;
  active_mutation uuid;
  active_mutation_heartbeat timestamptz;
  current_version integer;
  claim_clearance smallint;
  inserted_id uuid;
begin
  select pm.role, pm.clearance into actor_role, actor_clearance
  from public.project_members pm
  where pm.project_id = target_project_id and pm.user_id = actor_id;
  if actor_role is null or actor_role not in ('lead', 'reviewer') then
    raise exception using errcode = '42501', message = 'Project reviewer access is required';
  end if;

  select p.mutation_token, p.mutation_heartbeat_at into active_mutation, active_mutation_heartbeat
  from public.projects p where p.id = target_project_id for update;
  if active_mutation is not null then
    if active_mutation_heartbeat < now() - interval '15 minutes' then
      raise exception using errcode = '55P03', message = 'A previous update expired. Re-run the source import or extraction to recover the project before reviewing.';
    end if;
    raise exception using errcode = '55P03', message = 'Project records are changing. Wait for the current update to finish before reviewing.';
  end if;

  select c.version, c.clearance into current_version, claim_clearance
  from public.claims c where c.project_id = target_project_id and c.id = target_claim_id
  for update;
  if current_version is null or claim_clearance > actor_clearance then
    raise exception using errcode = '42501', message = 'Claim is unavailable at this clearance';
  end if;
  if current_version <> expected_version then
    raise exception using errcode = '40001', message = 'This finding changed since it was opened. Reload and try again.';
  end if;
  if target_decision = 'resolved' and length(trim(coalesce(target_edited_statement, ''))) = 0 then
    raise exception using errcode = '22023', message = 'Resolved wording cannot be blank';
  end if;

  update public.claims set version = version + 1, updated_at = now()
  where id = target_claim_id and project_id = target_project_id;
  update public.projects set revision = revision + 1, updated_at = now() where id = target_project_id;
  insert into public.review_decisions(project_id, claim_id, user_id, decision, edited_statement, note, claim_version)
  values (target_project_id, target_claim_id, actor_id, target_decision, nullif(trim(target_edited_statement), ''), left(coalesce(target_note, ''), 2000), current_version + 1)
  returning id into inserted_id;
  return inserted_id;
end;
$$;

create function public.approve_project(target_project_id uuid, actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_role public.project_role;
  current_revision bigint;
  active_mutation uuid;
  active_mutation_heartbeat timestamptz;
  snapshot_content jsonb;
  snapshot_id uuid;
begin
  select pm.role into actor_role from public.project_members pm
  where pm.project_id = target_project_id and pm.user_id = actor_id;
  if actor_role is distinct from 'lead' then
    raise exception using errcode = '42501', message = 'Only a project lead can approve a handover';
  end if;

  select p.revision, p.mutation_token, p.mutation_heartbeat_at into current_revision, active_mutation, active_mutation_heartbeat
  from public.projects p where p.id = target_project_id for update;
  if current_revision is null then
    raise exception using errcode = 'P0002', message = 'Project not found';
  end if;
  if active_mutation is not null then
    if active_mutation_heartbeat < now() - interval '15 minutes' then
      raise exception using errcode = '55P03', message = 'A previous update expired. Re-run the source import or extraction to recover the project before approving.';
    end if;
    raise exception using errcode = '55P03', message = 'Project records are changing. Wait for the current update to finish before approving.';
  end if;
  if exists (
    select 1 from public.claims c
    where c.project_id = target_project_id and not exists (
      select 1 from public.review_decisions d
      where d.project_id = c.project_id and d.claim_id = c.id
        and d.decision <> 'pending'
        and d.claim_version = c.version
        and d.id = (select d2.id from public.review_decisions d2 where d2.project_id = c.project_id and d2.claim_id = c.id order by d2.claim_version desc, d2.created_at desc, d2.id desc limit 1)
    )
  ) then
    raise exception using errcode = '23514', message = 'Every finding needs a human decision before approval';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'version', c.version, 'title', c.title, 'category', c.category,
      'statement', coalesce(r.edited_statement, c.statement), 'status', c.status,
      'decision', r.decision, 'clearance', c.clearance,
      'citations', (select coalesce(jsonb_agg(jsonb_build_object(
        'quote', ci.quote, 'relation', ci.relation,
        'passageId', sp.id, 'passageContent', sp.content, 'passageClearance', sp.clearance,
        'source', jsonb_build_object('id', s.id, 'title', s.title, 'provider', s.provider, 'url', s.url, 'author', s.author, 'occurredAt', s.occurred_at, 'clearance', s.clearance)
      ) order by s.occurred_at), '[]'::jsonb)
      from public.citations ci
      join public.source_passages sp on sp.id = ci.passage_id and sp.project_id = ci.project_id
      join public.sources s on s.id = sp.source_id and s.project_id = sp.project_id
      where ci.claim_id = c.id and ci.project_id = c.project_id)
    ) order by c.created_at
  ), '[]'::jsonb) into snapshot_content
  from public.claims c
  left join lateral (
    select d.decision, d.edited_statement from public.review_decisions d
    where d.claim_id = c.id and d.project_id = c.project_id
    order by d.claim_version desc, d.created_at desc, d.id desc limit 1
  ) r on true
  where c.project_id = target_project_id;

  insert into public.approved_snapshots(project_id, version, approved_by, content)
  values (target_project_id, current_revision, actor_id, snapshot_content)
  on conflict (project_id, version) do nothing
  returning id into snapshot_id;
  if snapshot_id is null then
    select s.id into snapshot_id from public.approved_snapshots s
    where s.project_id = target_project_id and s.version = current_revision;
  end if;
  return snapshot_id;
end;
$$;

create function public.begin_project_mutation(target_project_id uuid, target_mutation_token uuid)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  new_revision bigint;
begin
  update public.projects p
  set revision = p.revision + 1, mutation_token = target_mutation_token, mutation_heartbeat_at = now(), updated_at = now()
  where p.id = target_project_id and (
    p.mutation_token is null
    or p.mutation_heartbeat_at < now() - interval '15 minutes'
  )
  returning p.revision into new_revision;
  if new_revision is null then
    if exists (select 1 from public.projects p where p.id = target_project_id) then
      raise exception using errcode = '55P03', message = 'Another project update is still running.';
    end if;
    raise exception using errcode = 'P0002', message = 'Project not found';
  end if;
  return new_revision;
end;
$$;

create function public.finish_project_mutation(target_project_id uuid, target_mutation_token uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.projects set mutation_token = null, mutation_heartbeat_at = null, updated_at = now()
  where id = target_project_id and mutation_token = target_mutation_token;
  if not found then
    raise exception using errcode = '40001', message = 'Project update lock no longer belongs to this request.';
  end if;
end;
$$;

create function public.heartbeat_project_mutation(target_project_id uuid, target_mutation_token uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.projects set mutation_heartbeat_at = now()
  where id = target_project_id and mutation_token = target_mutation_token;
  if not found then
    raise exception using errcode = '40001', message = 'Project update lock no longer belongs to this request.';
  end if;
end;
$$;

create function public.prevent_approved_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'Approved snapshots are immutable';
end;
$$;

create trigger approved_snapshots_are_immutable
before update or delete on public.approved_snapshots
for each row execute function public.prevent_approved_snapshot_mutation();

create function public.acknowledge_snapshot(target_project_id uuid, target_snapshot_id uuid, actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  acknowledgement_id uuid;
begin
  if not exists (select 1 from public.project_members pm where pm.project_id = target_project_id and pm.user_id = actor_id) then
    raise exception using errcode = '42501', message = 'Project membership is required';
  end if;
  insert into public.receipt_acknowledgements(project_id, snapshot_id, acknowledged_by)
  select target_project_id, target_snapshot_id, actor_id
  where exists (select 1 from public.approved_snapshots s where s.id = target_snapshot_id and s.project_id = target_project_id)
  on conflict (snapshot_id, acknowledged_by) do update set acknowledged_at = now()
  returning id into acknowledgement_id;
  if acknowledgement_id is null then raise exception using errcode = 'P0002', message = 'Approved snapshot not found'; end if;
  return acknowledgement_id;
end;
$$;

revoke all on function public.record_review_decision(uuid, uuid, uuid, integer, public.review_disposition, text, text) from public, anon, authenticated;
revoke all on function public.approve_project(uuid, uuid) from public, anon, authenticated;
revoke all on function public.acknowledge_snapshot(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_project_mutation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_project_mutation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.heartbeat_project_mutation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_review_decision(uuid, uuid, uuid, integer, public.review_disposition, text, text) to service_role;
grant execute on function public.approve_project(uuid, uuid) to service_role;
grant execute on function public.acknowledge_snapshot(uuid, uuid, uuid) to service_role;
grant execute on function public.begin_project_mutation(uuid, uuid) to service_role;
grant execute on function public.finish_project_mutation(uuid, uuid) to service_role;
grant execute on function public.heartbeat_project_mutation(uuid, uuid) to service_role;

create function public.validate_citation_quote()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  source_content text;
begin
  select p.content into source_content
  from public.source_passages p
  where p.id = new.passage_id and p.project_id = new.project_id;
  if source_content is null then
    raise exception 'Citation passage does not exist in this project';
  end if;
  if new.start_offset is null then
    if position(new.quote in source_content) = 0 then
      raise exception 'Citation quote does not match its source passage';
    end if;
  elsif substring(source_content from new.start_offset + 1 for new.end_offset - new.start_offset) <> new.quote then
    raise exception 'Citation quote offsets do not match its source passage';
  end if;
  return new;
end;
$$;

create trigger citation_quote_must_match_passage
before insert or update of quote, start_offset, end_offset, passage_id, project_id
on public.citations
for each row execute function public.validate_citation_quote();

create index project_members_user_id_idx on public.project_members(user_id, project_id);
create index sources_project_clearance_idx on public.sources(project_id, clearance);
create index sources_external_id_idx on public.sources(project_id, provider, external_id);
create index source_passages_project_clearance_idx on public.source_passages(project_id, clearance);
create index source_passages_source_id_idx on public.source_passages(source_id);
create index source_passages_embedding_idx on public.source_passages using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
create index entities_project_id_idx on public.entities(project_id);
create index entity_edges_project_clearance_idx on public.entity_edges(project_id, clearance);
create index entity_edges_source_passage_id_idx on public.entity_edges(source_passage_id);
create index claims_project_clearance_status_idx on public.claims(project_id, clearance, status);
create index citations_claim_id_idx on public.citations(claim_id);
create index citations_passage_id_idx on public.citations(passage_id);
create index review_decisions_claim_id_idx on public.review_decisions(claim_id, created_at desc);
create index approved_snapshots_project_version_idx on public.approved_snapshots(project_id, version desc);

create function public.has_project_access(target_project_id uuid, required_clearance smallint default 1)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.clearance >= required_clearance
  );
$$;

revoke all on function public.has_project_access(uuid, smallint) from public, anon;
grant execute on function public.has_project_access(uuid, smallint) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.sources enable row level security;
alter table public.source_passages enable row level security;
alter table public.entities enable row level security;
alter table public.entity_edges enable row level security;
alter table public.claims enable row level security;
alter table public.citations enable row level security;
alter table public.review_decisions enable row level security;
alter table public.approved_snapshots enable row level security;
alter table public.receipt_acknowledgements enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.projects, public.project_members, public.sources, public.source_passages, public.entities, public.entity_edges, public.claims, public.citations, public.review_decisions to authenticated;

create policy "users read own profile" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "users insert own profile" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users update own profile" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "members read projects" on public.projects for select to authenticated using (public.has_project_access(id, 1::smallint));
create policy "members read memberships" on public.project_members for select to authenticated using (public.has_project_access(project_id, 1::smallint));
create policy "members read sources within clearance" on public.sources for select to authenticated using (public.has_project_access(project_id, clearance));
create policy "members read passages within clearance" on public.source_passages for select to authenticated using (public.has_project_access(project_id, clearance));
create policy "members read entities within clearance" on public.entities for select to authenticated using (public.has_project_access(project_id, clearance));
create policy "members read edges within clearance" on public.entity_edges for select to authenticated using (public.has_project_access(project_id, clearance));
create policy "members read claims within clearance" on public.claims for select to authenticated using (public.has_project_access(project_id, clearance));
create policy "members read citations when claim and passage accessible" on public.citations for select to authenticated using (
  public.has_project_access(project_id, 1::smallint)
  and exists (select 1 from public.claims c where c.id = citations.claim_id and c.project_id = citations.project_id)
  and exists (select 1 from public.source_passages p where p.id = citations.passage_id and p.project_id = citations.project_id)
);
create policy "members read review decisions within claim clearance" on public.review_decisions for select to authenticated using (
  public.has_project_access(project_id, 1::smallint)
  and exists (select 1 from public.claims c where c.id = review_decisions.claim_id and c.project_id = review_decisions.project_id)
);
create policy "members read approved snapshots" on public.approved_snapshots for select to authenticated using (public.has_project_access(project_id, 1::smallint));
create policy "members read acknowledgements" on public.receipt_acknowledgements for select to authenticated using (public.has_project_access(project_id, 1::smallint));

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
