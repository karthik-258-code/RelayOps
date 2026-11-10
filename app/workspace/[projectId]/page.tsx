import { notFound, redirect } from 'next/navigation';
import { RelayOpsApp } from '@/components/RelayOpsApp';
import { projectIdSchema } from '@/lib/projects/input';
import { projectRouteMembershipMatches } from '@/lib/projects/access';
import { requireUser } from '@/lib/server/access';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const { projectId: rawProjectId } = await params;
  const parsedProjectId = projectIdSchema.safeParse(rawProjectId);
  if (!parsedProjectId.success) notFound();
  const projectId = parsedProjectId.data;

  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase.from('project_members')
    .select('project_id,user_id,role,clearance')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  const memberIdentity = membership ? { userId: membership.user_id, projectId: membership.project_id } : null;
  if (!projectRouteMembershipMatches(user.id, projectId, memberIdentity)) notFound();

  const { data: project } = await supabase.from('projects')
    .select('id,name')
    .eq('id', projectId)
    .maybeSingle();
  if (!project || !membership) notFound();

  return <RelayOpsApp
    projectId={project.id}
    projectName={project.name}
    accessRole={membership.role}
    clearance={membership.clearance as 1 | 2 | 3}
  />;
}
