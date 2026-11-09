-- Synthetic local demo account and Project Chronos. This password is for the local stack only.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
  'lead@relayops.local', extensions.crypt('RelayOpsDemo!2026', extensions.gen_salt('bf')),
  now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Project Lead"}'::jsonb, now(), now()
) on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values (
  '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011',
  '{"sub":"10000000-0000-4000-8000-000000000011","email":"lead@relayops.local"}'::jsonb,
  'email', 'lead@relayops.local', now(), now(), now()
) on conflict (provider, provider_id) do nothing;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
  'contributor@relayops.local', extensions.crypt('RelayOpsDemo!2026', extensions.gen_salt('bf')),
  now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Incoming Contributor"}'::jsonb, now(), now()
) on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values (
  '10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000012',
  '{"sub":"10000000-0000-4000-8000-000000000012","email":"contributor@relayops.local"}'::jsonb,
  'email', 'contributor@relayops.local', now(), now(), now()
) on conflict (provider, provider_id) do nothing;

insert into public.profiles (user_id, display_name)
values
  ('10000000-0000-4000-8000-000000000011', 'Project Lead'),
  ('10000000-0000-4000-8000-000000000012', 'Incoming Contributor')
on conflict (user_id) do nothing;

insert into public.projects (id, name, slug, description, is_demo, created_by)
values (
  '20000000-0000-4000-8000-000000000011', 'Project Chronos', 'project-chronos',
  'Synthetic project used to demonstrate evidence-backed engineering handovers.', true,
  '10000000-0000-4000-8000-000000000011'
) on conflict (id) do nothing;

insert into public.project_members (project_id, user_id, role, clearance)
values
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'lead', 3),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000012', 'contributor', 1)
on conflict (project_id, user_id) do nothing;

insert into public.sources (id, project_id, provider, external_id, title, url, author, occurred_at, clearance, content_hash, metadata)
values
  ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'document', 'chronos/architecture.md', 'Architecture notes', null, 'Engineering team', '2026-10-28T09:00:00Z', 1, encode(extensions.digest('Chronos architecture notes', 'sha256'), 'hex'), '{"kind":"document","relayops_import":true}'),
  ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', 'task', 'CH-184', 'Session store rollout task', null, 'Mina Patel', '2026-10-30T11:30:00Z', 1, encode(extensions.digest('CH-184 session store', 'sha256'), 'hex'), '{"kind":"task","status":"in_progress","relayops_import":true}'),
  ('30000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000011', 'github', 'chronos#482', 'Session store implementation', 'https://github.com/example/chronos/pull/482', 'Platform team', '2026-10-31T15:00:00Z', 1, encode(extensions.digest('PR 482 session store', 'sha256'), 'hex'), '{"kind":"pull_request","number":482,"relayops_import":true}'),
  ('30000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000011', 'manual', 'incident/rollout-note', 'Rollout incident note', null, 'Project lead', '2026-11-01T08:30:00Z', 3, encode(extensions.digest('Synthetic restricted rollout note', 'sha256'), 'hex'), '{"kind":"internal_note","relayops_import":true}')
on conflict (project_id, provider, external_id) do nothing;

insert into public.source_passages (id, project_id, source_id, passage_index, content, content_hash, clearance)
values
  ('31000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000011', 0, 'Decision: Keep Redis as the session store for the first rollout. The team will revisit the database-backed session store after the pilot.', encode(extensions.digest('Decision: Keep Redis as the session store for the first rollout. The team will revisit the database-backed session store after the pilot.', 'sha256'), 'hex'), 1),
  ('31000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000012', 0, 'CH-184: Replace Redis with Postgres-backed sessions before the first rollout. Owner: Mina Patel. Status: In progress.', encode(extensions.digest('CH-184: Replace Redis with Postgres-backed sessions before the first rollout. Owner: Mina Patel. Status: In progress.', 'sha256'), 'hex'), 1),
  ('31000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000013', 0, 'This pull request adds the Postgres session adapter and keeps the Redis adapter enabled behind the rollout flag.', encode(extensions.digest('This pull request adds the Postgres session adapter and keeps the Redis adapter enabled behind the rollout flag.', 'sha256'), 'hex'), 1),
  ('31000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000014', 0, 'Restricted synthetic note: rollout credentials must rotate before the migration is enabled.', encode(extensions.digest('Restricted synthetic note: rollout credentials must rotate before the migration is enabled.', 'sha256'), 'hex'), 3)
on conflict (source_id, passage_index) do nothing;

insert into public.claims (id, project_id, title, category, statement, owner_name, due_at, status, confidence, clearance)
values
  ('40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'Session store for first rollout', 'decision', 'The first rollout will use Postgres-backed sessions; Redis remains enabled during the transition.', null, null, 'conflict', 0.92, 1),
  ('40000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', 'Session adapter implementation', 'ownership', 'Mina Patel owns CH-184; the implementation is in progress.', 'Mina Patel', null, 'verified', 0.88, 1),
  ('40000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000011', 'Credential rotation gate', 'risk', 'Credentials need rotation before migration enablement.', null, null, 'needs_review', null, 3)
on conflict (id) do nothing;

insert into public.citations (id, project_id, claim_id, passage_id, quote, relation)
values
  ('50000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000011', '31000000-0000-4000-8000-000000000011', 'Keep Redis as the session store for the first rollout', 'contradicts'),
  ('50000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000011', '31000000-0000-4000-8000-000000000012', 'Replace Redis with Postgres-backed sessions before the first rollout', 'supports'),
  ('50000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000012', '31000000-0000-4000-8000-000000000012', 'Owner: Mina Patel', 'supports'),
  ('50000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000013', '31000000-0000-4000-8000-000000000014', 'credentials must rotate before the migration is enabled', 'supports')
on conflict (id) do nothing;

insert into public.entities (id, project_id, canonical_name, entity_type, clearance)
values
  ('60000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'Redis', 'technology', 1),
  ('60000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', 'Postgres sessions', 'technology', 1),
  ('60000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000011', 'Mina Patel', 'person', 1)
on conflict (project_id, canonical_name, entity_type) do nothing;

insert into public.entity_edges (project_id, from_entity_id, to_entity_id, relation, valid_from, source_passage_id, confidence, clearance)
values
  ('20000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000012', 'replaced_by_after_pilot', '2026-10-28T09:00:00Z', '31000000-0000-4000-8000-000000000011', 0.94, 1),
  ('20000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000013', '60000000-0000-4000-8000-000000000012', 'owns_implementation', '2026-10-30T11:30:00Z', '31000000-0000-4000-8000-000000000012', 0.97, 1);

-- Project Chronos source pack: six architecture docs, eighteen repository records,
-- a Linear task-board export, and four Slack channel exports (including restricted evidence).
with docs as (
  select * from (values
    ('docs/architecture.md', 'Architecture decision record', 'Decision: Keep Redis as the active session store for the pilot. Postgres adapter remains behind a disabled flag until the rollback drill passes.', '2026-10-28T09:00:00Z', 1),
    ('docs/rollout.md', 'Pilot rollout checklist', 'Next action: Run the rollback drill in staging before enabling the Postgres session adapter. Owner: Mina Patel.', '2026-10-29T10:00:00Z', 1),
    ('docs/observability.md', 'Observability and alerting', 'Risk: Session migration can create stale-cookie failures. Blocker: The dashboard does not yet separate Redis and Postgres session errors.', '2026-10-29T14:00:00Z', 1),
    ('docs/security.md', 'Session security review', 'Decision: Rotate rollout credentials immediately before the migration flag is enabled. Next action: Security must approve the rotation evidence.', '2026-10-30T08:00:00Z', 2),
    ('docs/ownership.md', 'Service ownership map', 'Owner: Mina Patel owns the session adapter. Owner: Arjun Rao owns the rollout dashboard. Next action: Add a named on-call backup for the pilot.', '2026-10-30T12:00:00Z', 1),
    ('docs/rollback.md', 'Rollback runbook', 'Blocker: The rollback drill has not passed in staging. Decision: Keep the migration flag disabled until rollback evidence is reviewed.', '2026-10-31T09:00:00Z', 1)
  ) as t(external_id,title,content,occurred_at,clearance)
), repo_records as (
  select format('chronos:%s-%s', case when n <= 9 then 'pr' else 'issue' end, n) as external_id,
    case when n <= 9 then 'github' else 'github' end as provider,
    case when n <= 9 then format('PR #%s · %s', 470+n, (array['Add Postgres session adapter','Add migration flag','Add session metrics','Add cookie compatibility','Add rollback command','Add rollout dashboard','Add session store tests','Add canary configuration','Document migration path'])[n])
         else format('Issue #%s · %s', 180+n, (array['Rollback drill evidence','Stale cookie failures','Missing session dashboard','Credential rotation gate','Pilot owner backup','Canary rollout readiness','Adapter integration coverage','Token expiry regression','Release approval checklist'])[n-9]) end as title,
    case when n = 1 then 'PR proposes a Postgres adapter behind the migration flag; Redis remains active for the pilot.'
         when n = 2 then 'The migration flag stays disabled until the staging rollback drill passes.'
         when n = 3 then 'Adds separate Redis and Postgres session error counters for rollout monitoring.'
         when n = 10 then 'Issue remains open: rollback evidence is required before the pilot migration.'
         when n = 11 then 'Issue reports stale-cookie failures in the staging migration test.'
         when n = 12 then 'Issue remains open: the dashboard lacks separate session-store error rates.'
         when n = 13 then 'Issue requires credential rotation immediately before enabling the migration flag.'
         when n = 14 then 'Issue requests a named on-call backup for the pilot. Current owner: Arjun Rao.'
         else format('Chronos repository record %s: implementation and rollout evidence for the session-store migration. Review linked code and release status before treating this record as current.', n) end as content,
    '2026-10-30T08:00:00Z'::timestamptz + ((n-1)::text || ' hours')::interval as occurred_at, 1::smallint as clearance
  from generate_series(1,18) n
), linear_record as (
  select 'linear:CH-184'::text as external_id, 'task'::text as provider, 'Linear CH-184 · Session store rollout'::text as title,
    'Decision: Keep Redis active for the pilot. Owner: Mina Patel. Status: In progress. Next action: Complete the staging rollback drill before enabling the Postgres adapter.'::text as content,
    '2026-10-30T11:30:00Z'::timestamptz as occurred_at, 1::smallint as clearance
), slack_records as (
  select * from (values
    ('slack:#migration', 'Slack · #migration', 'Decision: Redis stays active during the pilot; enable Postgres only after rollback evidence is approved.', '2026-10-31T10:00:00Z', 1),
    ('slack:#engineering', 'Slack · #engineering', 'Blocker: The dashboard does not split Redis and Postgres errors. Next action: Arjun Rao adds the panel before canary.', '2026-10-31T12:00:00Z', 1),
    ('slack:#release', 'Slack · #release', 'Risk: Stale cookies appeared in staging. Next action: Mina Patel verifies cookie compatibility and posts the test result.', '2026-11-01T08:00:00Z', 1),
    ('slack:#security-confidential', 'Slack · #security-confidential', 'Restricted note: Rotate rollout credentials before enabling the migration flag. Security approval is still required.', '2026-11-01T08:30:00Z', 3)
  ) as t(external_id,title,content,occurred_at,clearance)
), all_records as (
  select external_id,'document'::text as provider,title,content,occurred_at::timestamptz,clearance, 'Engineering team'::text as author from docs
  union all select external_id,provider,title,content,occurred_at,clearance,'Chronos repository contributors' from repo_records
  union all select external_id,provider,title,content,occurred_at,clearance,'Mina Patel' from linear_record
  union all select external_id,'manual',title,content,occurred_at::timestamptz,clearance,'Chronos team' from slack_records
), inserted as (
  insert into public.sources (project_id,provider,external_id,title,author,occurred_at,clearance,content_hash,metadata)
  select '20000000-0000-4000-8000-000000000011',provider,external_id,title,author,occurred_at,clearance,
    encode(extensions.digest(content,'sha256'),'hex'),jsonb_build_object('kind',provider,'synthetic',true,'source_pack','chronos-round1','relayops_import',true)
  from all_records on conflict (project_id,provider,external_id) do nothing
  returning id,project_id,external_id
)
insert into public.source_passages (project_id,source_id,passage_index,content,content_hash,clearance)
select i.project_id,i.id,0,r.content,encode(extensions.digest(r.content,'sha256'),'hex'),r.clearance
from inserted i join all_records r on r.external_id=i.external_id
on conflict (source_id,passage_index) do nothing;

-- Structured Chronos findings make all four Round 1 reconstruction views visible immediately.
insert into public.claims (id,project_id,title,category,statement,owner_name,status,confidence,clearance)
values
  ('40000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000011','Rollback drill','blocker','The staging rollback drill has not passed; keep the migration flag disabled.','Mina Patel','needs_review',0.91,1),
  ('40000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000011','Pilot readiness actions','next-action','Mina Patel must complete the rollback drill; Arjun Rao must add separate session-store error metrics.','Mina Patel','needs_review',0.87,1),
  ('40000000-0000-4000-8000-000000000023','20000000-0000-4000-8000-000000000011','Session migration ownership','ownership','Mina Patel owns the session adapter; Arjun Rao owns rollout observability.','Mina Patel','verified',0.9,1),
  ('40000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000011','Stale cookie regression','risk','Stale-cookie failures were reported in staging and need verification before canary.','Mina Patel','needs_review',0.82,1)
on conflict (id) do nothing;

insert into public.citations (id,project_id,claim_id,passage_id,quote,relation)
select c.id::uuid,'20000000-0000-4000-8000-000000000011'::uuid,c.claim_id::uuid,p.id,c.quote,'supports'
from (values
  ('50000000-0000-4000-8000-000000000021','40000000-0000-4000-8000-000000000021','chronos:issue-10','Issue remains open: rollback evidence is required before the pilot migration.'),
  ('50000000-0000-4000-8000-000000000022','40000000-0000-4000-8000-000000000022','linear:CH-184','Next action: Complete the staging rollback drill before enabling the Postgres adapter.'),
  ('50000000-0000-4000-8000-000000000023','40000000-0000-4000-8000-000000000023','docs/ownership.md','Owner: Mina Patel owns the session adapter. Owner: Arjun Rao owns the rollout dashboard.'),
  ('50000000-0000-4000-8000-000000000024','40000000-0000-4000-8000-000000000024','slack:#release','Risk: Stale cookies appeared in staging.')
) as c(id,claim_id,external_id,quote)
join public.sources s on s.project_id='20000000-0000-4000-8000-000000000011' and s.external_id=c.external_id
join public.source_passages p on p.source_id=s.id and position(c.quote in p.content)>0
on conflict (id) do nothing;

-- Mark pre-existing sample rows as extraction inputs too (safe on a local seed rerun).
update public.sources set metadata = metadata || '{"relayops_import":true}'::jsonb
where project_id = '20000000-0000-4000-8000-000000000011'
  and (metadata->>'synthetic' = 'true' or external_id in ('chronos/architecture.md','CH-184','chronos#482','incident/rollout-note'));
