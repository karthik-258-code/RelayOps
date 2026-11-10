CREATE OR REPLACE FUNCTION public.create_project_for_user(target_name text, target_slug text, actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  created_project_id uuid;
BEGIN
  INSERT INTO public.projects (name, slug, is_demo, created_by)
  VALUES (target_name, target_slug, false, actor_id)
  RETURNING id INTO created_project_id;

  INSERT INTO public.project_members (project_id, user_id, role, clearance)
  VALUES (created_project_id, actor_id, 'lead', 3);

  RETURN created_project_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_project_for_user(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_for_user(text, text, uuid) TO service_role;
