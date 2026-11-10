import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { jsonError, requireUser } from '@/lib/server/access';
import { buildProjectSlug, parseCreateProjectInput } from '@/lib/projects/input';

export async function GET() {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in to view your projects.');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id,role,clearance')
    .eq('user_id', user.id);

  if (error) {
    console.error('Project listing failed:', error.message);
    return jsonError(500, 'PROJECT_LIST_FAILED', 'Projects could not be loaded. Try again.');
  }

  const memberships = data ?? [];
  const projectIds = memberships.map((membership) => membership.project_id);
  const projectsResult = projectIds.length
    ? await supabase.from('projects').select('id,name,slug,is_demo').in('id', projectIds)
    : { data: [], error: null };
  if (projectsResult.error) {
    console.error('Project listing failed:', projectsResult.error.message);
    return jsonError(500, 'PROJECT_LIST_FAILED', 'Projects could not be loaded. Try again.');
  }
  const projectsById = new Map((projectsResult.data ?? []).map((project) => [project.id, project]));
  const projects = memberships.flatMap((membership) => {
    const project = projectsById.get(membership.project_id);
    return project ? [{
      id: project.id,
      name: project.name,
      slug: project.slug,
      isDemo: project.is_demo,
      role: membership.role,
      clearance: membership.clearance,
    }] : [];
  });

  return Response.json({ projects }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before creating a project.');

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError(400, 'INVALID_JSON', 'Project details must be valid JSON.'); }

  let parsed: { name: string };
  try { parsed = parseCreateProjectInput(raw); }
  catch { return jsonError(400, 'INVALID_PROJECT', 'Enter a project name between 1 and 120 characters.'); }

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const slug = buildProjectSlug(parsed.name, suffix);
  const admin = createSupabaseAdminClient();
  const { data: projectId, error } = await admin.rpc('create_project_for_user', {
    target_name: parsed.name,
    target_slug: slug,
    actor_id: user.id,
  });

  if (error || !projectId) {
    console.error('Project creation failed:', error?.message ?? 'RPC returned no project ID');
    return jsonError(500, 'PROJECT_CREATE_FAILED', 'Project could not be created. Try again.');
  }

  return Response.json({
    project: { id: projectId, name: parsed.name, slug, isDemo: false, role: 'lead', clearance: 3 },
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

