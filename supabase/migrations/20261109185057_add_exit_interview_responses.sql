create function public.record_exit_interview_response(
  target_project_id uuid,
  target_claim_id uuid,
  actor_id uuid,
  expected_version integer,
  target_prompt text,
  target_response text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_role public.project_role;
  actor_clearance smallint;
  current_version integer;
  claim_clearance smallint;
  claim_status public.claim_status;
  claim_title text;
  active_mutation uuid;
  request_headers jsonb;
  request_mutation_token text;
  response_source_id uuid := gen_random_uuid();
  response_passage_id uuid := gen_random_uuid();
begin
  if expected_version is null or expected_version < 1
    or length(trim(coalesce(target_prompt, ''))) = 0
    or length(trim(coalesce(target_prompt, ''))) > 1000
    or length(trim(coalesce(target_response, ''))) = 0
    or length(target_response) > 4000 then
    raise exception using errcode = '22023', message = 'Interview prompt or response is invalid';
  end if;

  select pm.role, pm.clearance into actor_role, actor_clearance
  from public.project_members pm
  where pm.project_id = target_project_id and pm.user_id = actor_id;
  if actor_role is null or actor_role not in ('lead', 'reviewer') then
    raise exception using errcode = '42501', message = 'Project reviewer access is required';
  end if;

  select c.version, c.clearance, c.status, c.title
    into current_version, claim_clearance, claim_status, claim_title
  from public.claims c
  where c.project_id = target_project_id and c.id = target_claim_id
  for update;
  if current_version is null or claim_clearance > actor_clearance then
    raise exception using errcode = '42501', message = 'Claim is unavailable at this clearance';
  end if;
  if claim_status <> 'missing_evidence' then
    raise exception using errcode = '22023', message = 'Exit interviews are only available for evidence gaps';
  end if;
  if current_version <> expected_version then
    raise exception using errcode = '40001', message = 'This finding changed since it was opened. Reload and try again.';
  end if;

  request_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  request_mutation_token := request_headers ->> 'x-relayops-mutation-token';
  select p.mutation_token into active_mutation
  from public.projects p where p.id = target_project_id for update;
  if active_mutation is null or request_mutation_token is distinct from active_mutation::text then
    raise exception using errcode = '55P03', message = 'Project update lock does not match this write.';
  end if;

  insert into public.sources (
    id, project_id, provider, external_id, title, author, occurred_at, clearance, content_hash, metadata
  ) values (
    response_source_id,
    target_project_id,
    'manual',
    'exit-interview:' || response_source_id::text,
    left('Exit interview response: ' || claim_title, 240),
    'Departing contributor',
    now(),
    claim_clearance,
    encode(extensions.digest(trim(target_response), 'sha256'), 'hex'),
    jsonb_build_object(
      'record_type', 'exit_interview',
      'linked_claim_id', target_claim_id,
      'prompt', trim(target_prompt),
      'recorded_by', actor_id
    )
  );

  insert into public.source_passages (
    id, project_id, source_id, passage_index, content, content_hash, clearance
  ) values (
    response_passage_id,
    target_project_id,
    response_source_id,
    0,
    trim(target_response),
    encode(extensions.digest(trim(target_response), 'sha256'), 'hex'),
    claim_clearance
  );

  insert into public.citations (
    project_id, claim_id, passage_id, quote, start_offset, end_offset, relation
  ) values (
    target_project_id,
    target_claim_id,
    response_passage_id,
    trim(target_response),
    0,
    char_length(trim(target_response)),
    'context'
  );

  update public.claims set version = version + 1, updated_at = now()
  where id = target_claim_id and project_id = target_project_id;

  return response_source_id;
end;
$$;

revoke all on function public.record_exit_interview_response(uuid, uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_exit_interview_response(uuid, uuid, uuid, integer, text, text) to service_role;
