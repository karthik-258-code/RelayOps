import { redirect } from 'next/navigation';
import { RelayOpsApp } from "@/components/RelayOpsApp";
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export default async function WorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin.from('project_members')
    .select('project_id,role,clearance,projects!inner(slug)')
    .eq('user_id', user.id).eq('projects.slug', 'project-chronos').single();
  if (!membership) redirect('/login');
  return <RelayOpsApp projectId={membership.project_id} accessRole={membership.role} clearance={membership.clearance} />;
}
