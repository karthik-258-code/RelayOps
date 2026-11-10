BEGIN;
SELECT plan(13);

INSERT INTO auth.users (id, email)
VALUES ('90000000-0000-4000-8000-000000000001', 'project-creation@test.invalid');

CREATE TEMP TABLE created_project AS
SELECT public.create_project_for_user('New Project', 'new-project-a1b2', '90000000-0000-4000-8000-000000000001') AS id;

SELECT is((SELECT count(*)::integer FROM public.projects WHERE slug = 'new-project-a1b2'), 1, 'creates one project');
SELECT is((SELECT name FROM public.projects WHERE slug = 'new-project-a1b2'), 'New Project', 'stores requested name');
SELECT is((SELECT created_by FROM public.projects WHERE slug = 'new-project-a1b2'), '90000000-0000-4000-8000-000000000001'::uuid, 'stores creator');
SELECT is((SELECT is_demo FROM public.projects WHERE slug = 'new-project-a1b2'), false, 'new project is not demo');
SELECT is((SELECT count(*)::integer FROM public.project_members WHERE project_id = (SELECT id FROM created_project)), 1, 'creates exactly one membership');
SELECT is((SELECT role::text FROM public.project_members WHERE project_id = (SELECT id FROM created_project)), 'lead', 'creator starts as lead');
SELECT is((SELECT clearance::integer FROM public.project_members WHERE project_id = (SELECT id FROM created_project)), 3, 'creator starts at clearance three');

SELECT throws_ok(
  $$SELECT public.create_project_for_user('Duplicate', 'new-project-a1b2', '90000000-0000-4000-8000-000000000001')$$,
  '23505', NULL, 'duplicate slug fails atomically'
);
SELECT is((SELECT count(*)::integer FROM public.projects WHERE slug = 'new-project-a1b2'), 1, 'duplicate call adds no project');
SELECT is((SELECT count(*)::integer FROM public.project_members WHERE project_id = (SELECT id FROM created_project)), 1, 'duplicate call adds no membership');
SELECT ok(NOT has_function_privilege('anon', 'public.create_project_for_user(text,text,uuid)', 'EXECUTE'), 'anon cannot execute project creation');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_project_for_user(text,text,uuid)', 'EXECUTE'), 'authenticated cannot execute project creation');
SELECT ok(has_function_privilege('service_role', 'public.create_project_for_user(text,text,uuid)', 'EXECUTE'), 'service role can execute project creation');

SELECT * FROM finish();
ROLLBACK;
