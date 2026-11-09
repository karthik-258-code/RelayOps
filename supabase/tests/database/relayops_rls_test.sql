begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'lead@test.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'contributor@test.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'outsider@test.invalid');

insert into public.projects (id, name, slug, is_demo, created_by)
values
  ('20000000-0000-4000-8000-000000000001', 'Private Alpha', 'private-alpha', false, '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Private Beta', 'private-beta', false, '10000000-0000-4000-8000-000000000001');

insert into public.project_members (project_id, user_id, role, clearance)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'lead', 3),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'contributor', 1);

insert into public.sources (id, project_id, provider, external_id, title, clearance, content_hash)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'manual', 'alpha-public', 'Public evidence', 1, repeat('a', 64)),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'manual', 'alpha-restricted', 'Restricted evidence', 3, repeat('b', 64));

insert into public.claims (id, project_id, title, category, statement, status, clearance)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Visible claim', 'decision', 'Public', 'needs_review', 1),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Restricted claim', 'risk', 'Secret', 'needs_review', 3);

insert into public.source_passages (id, project_id, source_id, passage_index, content, content_hash, clearance)
values ('31000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 0, 'The database migration is scheduled for Friday.', repeat('c', 64), 1);
insert into public.source_passages (id, project_id, source_id, passage_index, content, content_hash, clearance)
values ('31000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 0, 'Restricted deployment credential evidence.', repeat('d', 64), 3);
update public.source_passages set embedding = ('[' || repeat('0,', 767) || '0]')::extensions.vector(768)
where id in ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003');
select throws_ok(
  $$insert into public.citations (project_id, claim_id, passage_id, quote) values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'The migration is scheduled for Monday.')$$,
  'P0001', 'Citation quote does not match its source passage', 'database rejects a fabricated evidence quote'
);
select lives_ok(
  $$insert into public.citations (project_id, claim_id, passage_id, quote, start_offset, end_offset) values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'scheduled for Friday', 26, 46)$$,
  'database accepts a quote with exact source offsets'
);
insert into public.source_passages (id, project_id, source_id, passage_index, content, content_hash, clearance)
values (
  '31000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', 1, '🌱 The migration is scheduled for Friday.',
  encode(extensions.digest('🌱 The migration is scheduled for Friday.', 'sha256'), 'hex'), 1
);
select lives_ok(
  $$insert into public.citations (project_id, claim_id, passage_id, quote, start_offset, end_offset) values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'scheduled for Friday', 19, 39)$$,
  'database accepts Unicode code-point offsets after a supplementary character'
);
select throws_ok(
  $$insert into public.citations (project_id, claim_id, passage_id, quote, start_offset, end_offset) values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'scheduled for Friday', 20, 40)$$,
  'P0001', 'Citation quote offsets do not match its source passage', 'database rejects JavaScript UTF-16 offsets for Unicode evidence'
);
select ok(not has_table_privilege('authenticated', 'public.approved_snapshots', 'SELECT'), 'users cannot query unfiltered handover snapshots directly');
select ok(not has_function_privilege('authenticated', 'public.approve_project(uuid,uuid)', 'EXECUTE'), 'users cannot call the privileged approval RPC directly');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select results_eq('select count(*) from public.projects', array[1::bigint], 'member sees only their project');
select results_eq('select count(*) from public.sources', array[1::bigint], 'clearance 1 member sees only clearance 1 source');
select results_eq('select count(*) from public.claims', array[1::bigint], 'clearance 1 member sees only clearance 1 claim');
select results_eq(
  $$select count(*) from public.match_project_passages('20000000-0000-4000-8000-000000000001', ('[' || repeat('0,', 767) || '0]')::extensions.vector(768), 3::smallint, 12)$$,
  array[1::bigint], 'vector RPC honors RLS even when caller requests restricted clearance'
);
select results_eq(
  $$select count(*) from public.match_project_passages('20000000-0000-4000-8000-000000000002', ('[' || repeat('0,', 767) || '0]')::extensions.vector(768), 3::smallint, 12)$$,
  array[0::bigint], 'vector RPC cannot cross project membership boundaries'
);
select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'client cannot create projects or self-assign lead');
select ok(not has_table_privilege('authenticated', 'public.project_members', 'INSERT'), 'client cannot elevate their own clearance');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select results_eq('select count(*) from public.projects', array[0::bigint], 'nonmember sees no private projects');
select results_eq('select count(*) from public.sources', array[0::bigint], 'nonmember sees no sources');
select results_eq('select count(*) from public.claims', array[0::bigint], 'nonmember sees no claims');

set local role service_role;
select lives_ok(
  $$select public.begin_project_mutation('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001')$$,
  'a source update advances the revision and acquires the approval lock'
);
select throws_ok(
  $$select public.approve_project('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '55P03', 'Project records are changing. Wait for the current update to finish before approving.', 'approval cannot race with a project update'
);
select throws_ok(
  $$select public.record_review_decision('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'confirmed', null, '')$$,
  '55P03', 'Project records are changing. Wait for the current update to finish before reviewing.', 'review decisions cannot race with an evidence update'
);
select throws_ok(
  $$update public.sources set title = 'Blocked stale write' where id = '30000000-0000-4000-8000-000000000001'$$,
  '55P03', 'Project update lock does not match this write.', 'service-role writes without the active mutation token are rejected'
);
select set_config('request.headers', '{"x-relayops-mutation-token":"50000000-0000-4000-8000-000000000001"}', true);
select lives_ok(
  $$update public.sources set title = 'Fenced valid write' where id = '30000000-0000-4000-8000-000000000001'$$,
  'writes carrying the active mutation token are accepted'
);
select lives_ok(
  $$select public.heartbeat_project_mutation('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001')$$,
  'active updates refresh their recovery lease'
);
update public.projects set mutation_heartbeat_at = now() - interval '16 minutes' where id = '20000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.begin_project_mutation('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')$$,
  'a fresh request can recover a mutation whose heartbeat expired'
);
select throws_ok(
  $$select public.finish_project_mutation('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001')$$,
  '40001', 'Project update lock no longer belongs to this request.', 'an expired mutation cannot release a newer request lock'
);
select set_config('request.headers', '{"x-relayops-mutation-token":"50000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$update public.sources set title = 'Blocked former owner' where id = '30000000-0000-4000-8000-000000000001'$$,
  '55P03', 'Project update lock does not match this write.', 'database fences writes from a replaced mutation token'
);
select set_config('request.headers', '{"x-relayops-mutation-token":"50000000-0000-4000-8000-000000000002"}', true);
select lives_ok(
  $$update public.sources set title = 'Fenced recovered write' where id = '30000000-0000-4000-8000-000000000001'$$,
  'recovered mutation token can write after the old lease is fenced'
);
select lives_ok(
  $$select public.finish_project_mutation('20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')$$,
  'the recovered request releases its own lock'
);
select set_config('request.headers', '{}', true);
select lives_ok(
  $$select public.record_review_decision('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'confirmed', null, '')$$,
  'project lead can save a review decision'
);
select throws_ok(
  $$select public.record_review_decision('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'rejected', null, '')$$,
  '40001', 'This finding changed since it was opened. Reload and try again.', 'stale review versions are rejected'
);
select throws_ok(
  $$select public.approve_project('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '23514', 'Every finding needs a human decision before approval', 'approval stays locked while a claim is pending'
);
select lives_ok(
  $$select public.record_review_decision('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 1, 'accepted_uncertainty', null, '')$$,
  'lead can decide on a restricted claim'
);
update public.claims set version = version + 1 where id = '40000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.approve_project('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '23514', 'Every finding needs a human decision before approval', 'a new claim version requires a fresh human decision'
);
select lives_ok(
  $$select public.record_review_decision('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 3, 'confirmed', null, '')$$,
  'lead can re-review a changed claim version'
);
select lives_ok(
  $$select public.approve_project('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  'lead can approve once every claim has a human decision'
);
select results_eq('select count(*) from public.approved_snapshots where project_id = ''20000000-0000-4000-8000-000000000001''', array[1::bigint], 'approval creates a versioned handover snapshot');
select lives_ok(
  $$select public.approve_project('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  'repeated approval returns the already approved immutable snapshot'
);
select results_eq('select count(*) from public.approved_snapshots where project_id = ''20000000-0000-4000-8000-000000000001''', array[1::bigint], 'repeated approval does not create or replace a snapshot');
select throws_ok(
  $$update public.approved_snapshots set content = '{}'::jsonb where project_id = '20000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Approved snapshots are immutable', 'approved snapshot content cannot be rewritten'
);

select ok(to_regprocedure('public.match_project_passages(uuid, extensions.vector, smallint, integer)') is not null, 'pgvector retrieval RPC is installed');
select ok(not has_function_privilege('anon', 'public.match_project_passages(uuid, extensions.vector, smallint, integer)', 'execute'), 'anonymous users cannot call vector retrieval');

select * from finish();
rollback;
