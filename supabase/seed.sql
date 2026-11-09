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
  ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'document', 'chronos/architecture.md', 'Architecture notes', null, 'Engineering team', '2026-10-28T09:00:00Z', 1, encode(extensions.digest('Chronos architecture notes', 'sha256'), 'hex'), '{"kind":"document"}'),
  ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', 'task', 'CH-184', 'Session store rollout task', null, 'Mina Patel', '2026-10-30T11:30:00Z', 1, encode(extensions.digest('CH-184 session store', 'sha256'), 'hex'), '{"kind":"task","status":"in_progress"}'),
  ('30000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000011', 'github', 'chronos#482', 'Session store implementation', 'https://github.com/example/chronos/pull/482', 'Platform team', '2026-10-31T15:00:00Z', 1, encode(extensions.digest('PR 482 session store', 'sha256'), 'hex'), '{"kind":"pull_request","number":482}'),
  ('30000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000011', 'manual', 'incident/rollout-note', 'Rollout incident note', null, 'Project lead', '2026-11-01T08:30:00Z', 3, encode(extensions.digest('Synthetic restricted rollout note', 'sha256'), 'hex'), '{"kind":"internal_note"}')
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
